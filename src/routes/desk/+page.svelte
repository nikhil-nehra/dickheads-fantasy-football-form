<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import PinPad from '$lib/components/PinPad.svelte';
	import SurveyTally from '$lib/components/SurveyTally.svelte';
	import { STATUS_META, ALL_STATUSES } from '$lib/status';
	import { fieldStatus, isNone, ownValue } from '$lib/negotiation';
	import { autoPair } from '$lib/pairing';
	import { confidence } from '$lib/sleeperMatch';
	import type { SurveyStatus } from '$lib/server/db';
	import type { NegotiationQuestion } from '$lib/surveys/types';
	import { allQuestions } from '$lib/surveys/types';
	import { reduced } from '$lib/motion';
	import {
		BRACKETS,
		BRACKET_LABEL,
		MAX_SLICES,
		PLACES,
		type Bracket,
		type Place,
		type SplitSlice,
		parsePlacementKey,
		payouts,
		placementKey,
		placementLabel
	} from '$lib/pot';
	import {
		DEFAULT_DEADLINE,
		EMPTY_RULING,
		MAX_DEADLINE,
		MAX_INSTRUCTIONS,
		MAX_PUNISHMENT,
		MAX_VICTIM,
		type PunishmentRuling
	} from '$lib/punishment';
	import { ballotTally } from '$lib/tally';
	import Icon from '$lib/components/Icon.svelte';

	let { data } = $props();

	/* ── The split ──────────────────────────────────────────────────────────
	   Two jobs share this page and they are not the same job. One is READING:
	   what the league said, every survey, every answer, including the ones
	   that get published somewhere else or quietly pre-fill an editor two tabs
	   away. The other is DECIDING: the pairings, the sentence, the pot, the
	   Sleeper links.

	   Flat, they were seven peer tabs in one rail and the rail sorted them by
	   nothing — a results page sat between two editors, and there was no way to
	   tell from the tab whether pressing it would change anything. The rail now
	   picks the job first and the tab second. */
	type LeagueTab = 'control' | 'rivalries' | 'punishment' | 'pot' | 'sleeper';

	let view = $state<'surveys' | 'league'>('surveys');
	let leagueTab = $state<LeagueTab>('control');
	let surveyTab = $state('');
	let busy = $state('');
	let flash = $state('');
	let error = $state('');

	/* Falls back to the first survey rather than being seeded from it, so the
	   registry stays the only thing that decides what exists here. */
	let activeSurvey = $derived(
		data.authed ? (data.surveys.find((s) => s.def.id === surveyTab) ?? data.surveys[0]) : undefined
	);

	/** Jump from a result to the editor it feeds. */
	function toDesk(tab: string) {
		view = 'league';
		leagueTab = tab as LeagueTab;
	}

	/* ── "The commissioner sees all" ────────────────────────────────────────
	   A pair of eyes on the League Control card that follow the pointer. They
	   do nothing and control nothing; they are here because the original kept
	   promising the commissioner was watching and never once showed it. */
	let eyes = $state<HTMLElement | null>(null);
	let pupil = $state({ x: 0, y: 0 });

	function trackEyes(e: PointerEvent) {
		if (!eyes || view !== 'league' || leagueTab !== 'control' || reduced()) return;
		const box = eyes.getBoundingClientRect();
		const dx = e.clientX - (box.left + box.width / 2);
		const dy = e.clientY - (box.top + box.height / 2);
		const dist = Math.hypot(dx, dy) || 1;
		const travel = Math.min(3, dist / 30);
		pupil = { x: (dx / dist) * travel, y: (dy / dist) * travel };
	}

	async function post(url: string, body: unknown, note: string) {
		busy = note;
		error = '';
		try {
			const res = await fetch(url, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(body)
			});
			if (!res.ok) {
				const b = (await res.json().catch(() => ({}))) as { message?: string };
				error = b.message ?? 'That did not work.';
				return false;
			}
			await invalidateAll();
			flash = note;
			setTimeout(() => (flash = ''), 2500);
			return true;
		} catch {
			error = "Couldn't reach the server.";
			return false;
		} finally {
			busy = '';
		}
	}

	function setStatus(surveyId: string, status: SurveyStatus) {
		return post('/api/desk/status', { surveyId, status }, `${surveyId} → ${status}`);
	}

	async function logout() {
		await fetch('/api/desk/session', { method: 'DELETE' });
		await invalidateAll();
	}

	/* ── Rivalries ──────────────────────────────────────────────────────── */

	let rivalrySurvey = $derived(
		data.authed
			? data.surveys.find((s) => allQuestions(s.def).some((q) => q.type === 'negotiation'))
			: undefined
	);

	let rivalryFields = $derived(
		(rivalrySurvey
			? (allQuestions(rivalrySurvey.def).find((q) => q.type === 'negotiation') as
					| NegotiationQuestion
					| undefined)
			: undefined
		)?.fields ?? []
	);

	/* Only a line with two sides can stall, so only a line with two sides gets a
	   ruling box. Forcing a value on an 'own' line would write one answer over
	   a pair of them and hand both teams the same colour — the single outcome
	   the header cannot draw. They are shown, not rulable. */
	let negFields = $derived(rivalryFields.filter((f) => f.mode !== 'own'));
	let ownFields = $derived(rivalryFields.filter((f) => f.mode === 'own'));

	/** One player's answer on one line, in words rather than in storage terms. */
	function sideAnswer(pick: string | null): string {
		if (!pick) return 'nothing yet';
		return isNone(pick) ? 'wants none' : pick;
	}

	// Beef rankings feed the auto-pair suggestion.
	let beef = $derived.by(() => {
		if (!data.authed) return {};
		const intake = data.surveys.find((s) =>
			allQuestions(s.def).some((q) => q.type === 'rank' && q.source.kind === 'roster')
		);
		if (!intake) return {};
		const rankQ = allQuestions(intake.def).find(
			(q) => q.type === 'rank' && q.source.kind === 'roster'
		);
		if (!rankQ) return {};
		const out: Record<string, string[]> = {};
		for (const s of intake.submissions) {
			const v = s.answers[rankQ.id];
			if (Array.isArray(v)) out[s.playerId] = v as string[];
		}
		return out;
	});

	let suggested = $derived(
		data.authed ? autoPair(data.players.map((p) => p.id), beef) : []
	);

	/* ── The pot ────────────────────────────────────────────────────────────
	   The buy-in and the split used to be read out of the intake survey and
	   printed on the board beside their vote counts. They are decisions, not
	   tallies — the survey is how you make up your mind, this is where you say
	   what you decided. */

	let potBuyIn = $state(0);
	let potSplit = $state<SplitSlice[]>([]);
	let potLoaded = $state(false);

	// Seeded once from the loader, then owned by the form — reseeding on every
	// invalidateAll would throw away whatever is half-typed.
	$effect(() => {
		if (!data.authed || potLoaded) return;
		potBuyIn = data.pot.buyIn;
		potSplit = data.pot.split.map((s) => ({ ...s }));
		potLoaded = true;
	});

	let splitTotal = $derived(potSplit.reduce((a, b) => a + (Number(b.pct) || 0), 0));
	let potSize = $derived(data.authed ? potBuyIn * data.players.length : 0);

	/* Which seats are already spoken for. The picker greys these out, so the
	   duplicate the validator refuses is also one you cannot reach. */
	let taken = $derived(new Set(potSplit.map(placementKey)));

	/* Everything the server would reject, checked here in the same words.
	   `validatePot` refuses a slice on 0%, but the Save button only ever
	   watched the total — so adding a slice and saving without dialling it in
	   passed the client and failed the server, and the only clue was a red bar
	   at the top of the page. */
	let splitProblems = $derived.by(() => {
		const out: string[] = [];
		if (potSplit.length === 0) return out;
		if (splitTotal !== 100) {
			out.push(`The split totals ${splitTotal}%. It has to be exactly 100%.`);
		}
		if (potSplit.some((sl) => !(Number(sl.pct) > 0))) {
			out.push('Every slice needs a share above 0%. Remove the ones that get nothing.');
		}
		if (taken.size !== potSplit.length) {
			out.push('Two slices are paying the same placement.');
		}
		return out;
	});

	let splitOk = $derived(splitProblems.length === 0);

	/* The next unclaimed finishing position in a table, so pressing a button
	   four times gives 1st through 4th rather than four copies of one seat.

	   Both tables work the same way. The regular season used to get a single
	   button that added 1st and then latched to "Regular season is in ✓",
	   which quietly decided on the league's behalf that only the winner of the
	   fourteen weeks could be paid — a carve-out, not a table. It is a table:
	   pay as far down it as you like. */
	function nextFree(bracket: Bracket): Place | undefined {
		return PLACES.find((place) => !taken.has(placementKey({ bracket, place })));
	}

	function addPlacement(bracket: Bracket) {
		if (potSplit.length >= MAX_SLICES) return;
		const place = nextFree(bracket);
		if (place === undefined) return;
		potSplit = [...potSplit, { bracket, place, pct: 0 }];
	}

	let full = $derived(potSplit.length >= MAX_SLICES);

	function setPlacement(i: number, key: string) {
		const next = parsePlacementKey(key);
		if (!next) return;
		potSplit = potSplit.map((sl, x) => (x === i ? { ...sl, ...next } : sl));
	}

	function removeSlice(i: number) {
		potSplit = potSplit.filter((_, x) => x !== i);
	}

	/* Paid marks post one player at a time and re-load, so two devices marking
	   two different people cannot revert each other. `marking` keeps the row
	   that is in flight disabled without freezing the rest of the list. */
	let marking = $state('');

	let paidSet = $derived(new Set(data.authed ? data.paidIds : []));
	let paidCount = $derived(paidSet.size);
	let collected = $derived(paidCount * potBuyIn);

	async function togglePaid(playerId: string, name: string, paid: boolean) {
		marking = playerId;
		try {
			await post('/api/desk/payment', { playerId, paid }, `${name} ${paid ? 'paid' : 'unpaid'}`);
		} finally {
			marking = '';
		}
	}

	/* ── The punishment ─────────────────────────────────────────────────────
	   Owned by the form once seeded, exactly like the pot editor above and for
	   the same reason: reseeding on every invalidateAll would throw away
	   whatever is half-typed. */
	let pun = $state<PunishmentRuling>({ ...EMPTY_RULING });
	let punLoaded = $state(false);

	$effect(() => {
		if (!data.authed || punLoaded) return;
		pun = { ...data.punishment };
		punLoaded = true;
	});

	/* The vote, as advice. The commissioner still types the sentence, because
	   a tie has to be broken by somebody and the winning wording is often not
	   the wording you want printed. */
	let ballotLeader = $derived.by(() => {
		if (!data.authed || !rivalrySurvey) return null;
		const q = allQuestions(rivalrySurvey.def).find((x) => x.type === 'ballot');
		if (!q || q.type !== 'ballot') return null;
		const opts = rivalrySurvey.ballots[q.id] ?? [];
		const rows = ballotTally(q, rivalrySurvey.submissions, new Map(opts.map((o) => [o.id, o.text])));
		return rows[0] ?? null;
	});

	function useLeader() {
		if (ballotLeader) pun.punishment = ballotLeader.label;
	}

	function savePunishment() {
		return post('/api/desk/punishment', { ...pun }, 'punishment set');
	}

	function savePot() {
		return post(
			'/api/desk/pot',
			{
				buyIn: Number(potBuyIn) || 0,
				split: potSplit.map((s) => ({
					bracket: s.bracket,
					place: s.place,
					pct: Number(s.pct) || 0
				}))
			},
			'pot saved'
		);
	}

	function entriesFor(pairingId: string, playerId: string) {
		if (!data.authed) return [];
		return data.negotiation.filter(
			(e) => e.pairing_id === pairingId && e.player_id === playerId
		);
	}

	function rulingsFor(pairingId: string) {
		return data.authed ? data.rulings.filter((r) => r.pairing_id === pairingId) : [];
	}

	let rulingDraft = $state<Record<string, string>>({});

	function applySuggested() {
		return post(
			'/api/desk/pairings',
			{ pairs: suggested, source: 'auto' },
			`${suggested.length} pairings set`
		);
	}

	/* ── Sleeper linking ────────────────────────────────────────────────── */

	let linkedCount = $derived(
		data.authed ? data.players.filter((p) => p.sleeperUserId).length : 0
	);

	let unclaimed = $derived.by(() => {
		if (!data.authed) return [];
		const taken = new Set(data.players.map((p) => p.sleeperUserId).filter(Boolean));
		return data.sleeper.accounts
			.filter((a) => !taken.has(a.userId))
			.map((a) => a.displayName);
	});

	function accountName(userId: string): string {
		if (!data.authed) return userId;
		return data.sleeper.accounts.find((a) => a.userId === userId)?.displayName ?? userId;
	}

	function setLink(playerId: string, userId: string) {
		if (!data.authed) return;
		const account = data.sleeper.accounts.find((a) => a.userId === userId);
		return post(
			'/api/desk/link',
			{
				playerId,
				sleeperUserId: userId || null,
				rosterId: account?.rosterId ?? null
			},
			userId ? `linked ${accountName(userId)}` : 'unlinked'
		);
	}
</script>

<svelte:head>
	<title>Commissioner's Desk — The Dickhead's League</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<svelte:window onpointermove={trackEyes} />

<div class="shell shell--wide">
	{#if !data.authed}
		<section class="card">
			<PinPad />
		</section>
	{:else}
		{#if error}<p class="notice notice--danger" role="alert">{error}</p>{/if}
		{#if flash}
			<!-- Keyed on the message so the whistle blows again on every ruling,
			     not just the first one of the session. -->
			{#key flash}
				<p class="notice notice--ok ruled" role="status">
					<Icon name="whistle" size={18} class="icon--blow" />
					Done: {flash}
				</p>
			{/key}
		{/if}

		<!-- The job first. Two halves, each saying plainly what pressing it
		     does to the league: nothing, or something. -->
		<div class="split" role="tablist" aria-label="Desk">
			<button
				role="tab"
				aria-selected={view === 'surveys'}
				class:on={view === 'surveys'}
				onclick={() => (view = 'surveys')}
			>
				<Icon name="clipboard" size={20} />
				<span>
					<strong>Surveys</strong>
					<i>What the league said — every answer, read-only</i>
				</span>
			</button>
			<button
				role="tab"
				aria-selected={view === 'league'}
				class:on={view === 'league'}
				onclick={() => (view = 'league')}
			>
				<Icon name="whistle" size={20} />
				<span>
					<strong>League Controls</strong>
					<i>What you decide — rivalries, punishment, pot, Sleeper</i>
				</span>
			</button>
		</div>

		<!-- …then the tab, within that job. -->
		{#if view === 'surveys'}
			<div class="tabs tabs--fit" role="tablist" aria-label="Surveys">
				{#each data.surveys as s (s.def.id)}
					<button
						role="tab"
						aria-selected={activeSurvey?.def.id === s.def.id}
						class:on={activeSurvey?.def.id === s.def.id}
						onclick={() => (surveyTab = s.def.id)}
					>
						{s.def.short}
						<i class="tab-n">{s.submissions.length}/{data.players.length}</i>
					</button>
				{/each}
			</div>
		{:else}
			<div class="tabs" role="tablist" aria-label="League controls">
				<button
					role="tab"
					aria-selected={leagueTab === 'control'}
					class:on={leagueTab === 'control'}
					onclick={() => (leagueTab = 'control')}>League Control</button
				>
				<button
					role="tab"
					aria-selected={leagueTab === 'rivalries'}
					class:on={leagueTab === 'rivalries'}
					onclick={() => (leagueTab = 'rivalries')}>Rivalries</button
				>
				<button
					role="tab"
					aria-selected={leagueTab === 'punishment'}
					class:on={leagueTab === 'punishment'}
					onclick={() => (leagueTab = 'punishment')}>The Punishment</button
				>
				<button
					role="tab"
					aria-selected={leagueTab === 'pot'}
					class:on={leagueTab === 'pot'}
					onclick={() => (leagueTab = 'pot')}>The Pot</button
				>
				<button
					role="tab"
					aria-selected={leagueTab === 'sleeper'}
					class:on={leagueTab === 'sleeper'}
					onclick={() => (leagueTab = 'sleeper')}>Sleeper</button
				>
			</div>
		{/if}

		{#if view === 'surveys'}
			{#if activeSurvey}
				{@const s = activeSurvey}
				<section class="card">
					<div class="survey-head">
						<div>
							<h2 class="display">{s.def.title}</h2>
							<p class="q-help">{s.def.blurb}</p>
						</div>
						<span class="badge badge--{s.status}">{STATUS_META[s.status as SurveyStatus].label}</span>
					</div>

					<p class="faint">
						<strong class="nums">{s.submissions.length}</strong> of {data.players.length} in · last
						changed {s.changedAt ?? 'never'}
					</p>

					<!-- Reading and deciding are the whole point of the split, so this
					     side gets a way ACROSS rather than a second copy of the
					     controls. Two places writing one status is two places to have
					     to look when it is wrong. -->
					<div class="row survey-actions">
						<a class="btn btn--ghost btn--sm" href="/s/{s.def.id}">Open the form</a>
						<button class="btn btn--ghost btn--sm" onclick={() => toDesk('control')}>
							Open or close it
						</button>
					</div>

					<SurveyTally
						def={s.def}
						submissions={s.submissions}
						roster={data.players}
						ballots={s.ballots}
						potSize={data.pot.buyIn * data.players.length}
						pairings={data.pairings}
						negotiation={data.negotiation}
						rulings={data.rulings}
						onFeedJump={toDesk}
					/>
				</section>
			{/if}
		{:else if leagueTab === 'control'}
			<section class="card">
				<div class="head">
					<h2 class="display">League Control</h2>
					<span class="watcher" bind:this={eyes} aria-hidden="true" title="The commissioner sees all">
						<i style="--px:{pupil.x}px; --py:{pupil.y}px"></i>
						<i style="--px:{pupil.x}px; --py:{pupil.y}px"></i>
					</span>
				</div>

				{#if data.problems.length}
					<div class="notice notice--danger">
						<strong>Setup needs attention</strong>
						<ul>
							{#each data.problems as p}<li>{p}</li>{/each}
						</ul>
					</div>
				{/if}

				{#each data.surveys as s (s.def.id)}
					<div class="ctl">
						<div class="ctl-head">
							<div>
								<strong>{s.def.title}</strong>
								<p class="faint">
									{s.submissions.length} / {data.players.length} in · last changed {s.changedAt ??
										'never'}
								</p>
							</div>
							<span class="badge badge--{s.status}">{STATUS_META[s.status as SurveyStatus].label}</span>
						</div>

						<div class="row">
							{#each ALL_STATUSES as st}
								<button
									class="chip"
									aria-pressed={s.status === st}
									disabled={!!busy}
									onclick={() => setStatus(s.def.id, st)}>{STATUS_META[st].label}</button
								>
							{/each}
						</div>
						<p class="faint">{STATUS_META[s.status as SurveyStatus].note}</p>
					</div>
				{/each}

				<details class="audit">
					<summary>Recent activity</summary>
					<ul>
						{#each data.audit as a (a.id)}
							<li><code>{a.at}</code> {a.action} <span class="faint">{a.detail}</span></li>
						{:else}
							<li class="faint">Nothing yet.</li>
						{/each}
					</ul>
				</details>

				<button class="btn btn--ghost" onclick={logout}>Lock the desk</button>
			</section>
		{:else if leagueTab === 'rivalries'}
			<section class="card">
				<h2 class="display">Rivalries</h2>

				{#if data.pairings.length === 0}
					<p class="q-help">
						No pairings set for {data.season}. The suggestion below comes from everyone's beef
						rankings.
					</p>
					<ul class="suggest">
						{#each suggested as [a, b]}
							<li>
								{data.players.find((p) => p.id === a)?.display_name}
								<span class="faint">vs</span>
								{data.players.find((p) => p.id === b)?.display_name}
							</li>
						{/each}
					</ul>
					<button class="btn btn--primary" disabled={!!busy || !suggested.length} onclick={applySuggested}>
						Use these {suggested.length} pairings
					</button>
				{:else}
					{#each data.pairings as p (p.id)}
						<div class="pair">
							<div class="pair-head">
								<strong>{p.aName} vs {p.bName}</strong>
								<span class="faint">{p.source}</span>
							</div>

							{#each negFields as f (f.key)}
								{@const st = fieldStatus(
									f.key,
									entriesFor(p.id, p.a),
									entriesFor(p.id, p.b),
									rulingsFor(p.id)
								)}
								<div class="line">
									<div class="line-head">
										<span class="down-tag">{f.short}</span>
										<span
											class="badge"
											class:badge--open={st.state === 'agreed'}
											class:badge--closed={st.state === 'waiting'}
											class:badge--draft={st.state === 'open'}
											class:badge--archived={st.state === 'forced'}
										>
											{#if st.state === 'agreed'}Agreed{:else if st.state === 'forced'}Ruled{:else if st.state === 'waiting'}In dispute{:else}Not set{/if}
										</span>
									</div>

									{#if st.value}
										<!-- A pair who agreed there is no bet have settled it, and the
										     Desk has to say so in words. Printed raw this was the
										     literal string "None", which reads as a bug. -->
										<p class="settled" class:settled--none={isNone(st.value)}>
											{isNone(st.value) ? (f.optional?.none ?? "There isn't one.") : st.value}
										</p>
									{/if}

									<!-- Each side's answer, once. It used to print
									     "$35 (backing $35)" for every line: `proposal` and `pick`
									     were two steps of a negotiation that no longer has two
									     steps, and they now always hold the same value. -->
									<p class="faint">
										{p.aName}: {sideAnswer(st.myPick)} · {p.bName}: {sideAnswer(st.theirPick)}
									</p>

									<div class="row">
										<input
											type="text"
											placeholder="Force a ruling…"
											value={rulingDraft[`${p.id}:${f.key}`] ?? ''}
											oninput={(e) =>
												(rulingDraft[`${p.id}:${f.key}`] = e.currentTarget.value)}
										/>
										<button
											class="btn btn--ghost"
											disabled={!!busy}
											onclick={() =>
												post(
													'/api/desk/ruling',
													{
														pairingId: p.id,
														fieldKey: f.key,
														value: rulingDraft[`${p.id}:${f.key}`] ?? ''
													},
													`ruling on ${f.short}`
												)}>Rule</button
										>
										{#if st.state === 'forced'}
											<button
												class="btn btn--ghost"
												disabled={!!busy}
												onclick={() =>
													post(
														'/api/desk/ruling',
														{ pairingId: p.id, fieldKey: f.key, value: '' },
														`withdrew ruling on ${f.short}`
													)}>Withdraw</button
											>
										{/if}
									</div>
								</div>
							{/each}

							{#if ownFields.length}
								<!-- Read-only, because there is nothing here to settle: two
								     sets of colours that both stand. Worth showing anyway —
								     a pair who have both picked nothing is a pair whose card
								     on the board is two greys. -->
								<div class="line">
									<div class="line-head">
										<span class="down-tag">Team colors</span>
									</div>
									{#each [{ name: p.aName, id: p.a }, { name: p.bName, id: p.b }] as side (side.id)}
										<p class="faint">
											{side.name}:
											{#each ownFields as f (f.key)}
												{@const hex = ownValue(f.key, entriesFor(p.id, side.id))}
												{#if hex}
													<span class="swatch" style="--c:{hex}"></span>{hex}{' '}
												{:else}
													<span>{f.short.toLowerCase()} not set{' '}</span>
												{/if}
											{/each}
										</p>
									{/each}
								</div>
							{/if}
						</div>
					{/each}
				{/if}
			</section>
		{:else if leagueTab === 'punishment'}
			<section class="card">
				<h2 class="display">The Punishment</h2>
				<p class="q-help">
					What the league is held to, as you rule it. The ballot over on
					<button type="button" class="linky" onclick={() => (view = 'surveys')}>Surveys</button>
					is where you read the vote; this is where you say what it came to. It goes straight to
					<a href="/b/punishment">The Punishment board</a>, which publishes no votes and no
					counts.
				</p>

				{#if ballotLeader}
					<p class="notice">
						The ballot currently has <strong>{ballotLeader.label}</strong> in front on
						{ballotLeader.points} points.
						<button class="btn btn--ghost btn--sm" onclick={useLeader}>Use it</button>
					</p>
				{/if}

				<label class="pun-field">
					<span class="down-tag">The punishment</span>
					<textarea rows="2" maxlength={MAX_PUNISHMENT} bind:value={pun.punishment}
						placeholder="24 straight hours inside an IHOP"></textarea>
				</label>

				<label class="pun-field">
					<span class="down-tag">Who does it</span>
					<input type="text" maxlength={MAX_VICTIM} bind:value={pun.victim}
						placeholder="Last place, toilet bowl" />
				</label>

				<label class="pun-field">
					<span class="down-tag">Done by</span>
					<input type="text" maxlength={MAX_DEADLINE} bind:value={pun.deadline}
						placeholder={DEFAULT_DEADLINE} />
				</label>

				<label class="pun-field">
					<span class="down-tag">The instructions</span>
					<textarea rows="8" maxlength={MAX_INSTRUCTIONS} bind:value={pun.instructions}
						placeholder="How it is done, and what counts as proof. Line breaks survive."
					></textarea>
				</label>

				<button class="btn btn--primary" disabled={!!busy} onclick={savePunishment}>
					Publish the ruling
				</button>
			</section>
		{:else if leagueTab === 'pot'}
			<section class="card">
				<h2 class="display">The Pot</h2>
				<p class="q-help">
					The buy-in and the payout split, as decided. The intake survey over on
					<button type="button" class="linky" onclick={() => (view = 'surveys')}>Surveys</button>
					is where people <em>argued</em> about these; this is where you say what they came to.
					Both go straight to <a href="/b/pot">The Pot board</a>, which publishes no survey
					answers at all.
				</p>

				<div class="pot-grid">
					<label class="pot-field">
						<span class="down-tag">Buy-in</span>
						<span class="pot-input">
							<span aria-hidden="true">$</span>
							<input
								type="number"
								min="0"
								step="1"
								inputmode="numeric"
								bind:value={potBuyIn}
								aria-label="Buy-in in dollars"
							/>
						</span>
						<span class="faint">per player</span>
					</label>

					<div class="pot-field">
						<span class="down-tag gold">The pot</span>
						<span class="pot-total nums">${potSize.toLocaleString()}</span>
						<span class="faint">{data.players.length} players in</span>
					</div>
				</div>

				<h3 class="rail">The split</h3>
				<p class="q-help">
					Percentages of the pot. They have to total exactly 100% — anything less quietly
					publishes a pot that pays out less than it holds. Every slice names a finishing
					position in one of two tables: the final standings, and the regular season
					before it. Pay as far down either as you like — three deep in the bracket and
					two deep in the regular season is a split, not a special case.
				</p>

				{#each potSplit as slice, i (placementKey(slice))}
					<div class="slice">
						<!-- A picker rather than a text box. The label the board prints is
						     derived from what is chosen here, so it cannot be misspelled,
						     and a seat already in the split cannot be chosen twice. -->
						<select
							aria-label="Slice {i + 1} placement"
							value={placementKey(slice)}
							onchange={(e) => setPlacement(i, e.currentTarget.value)}
						>
							{#each BRACKETS as bracket (bracket)}
								<optgroup label={BRACKET_LABEL[bracket]}>
									{#each PLACES as place (place)}
										{@const key = placementKey({ bracket, place })}
										<option value={key} disabled={key !== placementKey(slice) && taken.has(key)}>
											{placementLabel({ bracket, place })}
										</option>
									{/each}
								</optgroup>
							{/each}
						</select>
						<span class="pot-input pot-input--pct">
							<input
								type="number"
								min="0"
								max="100"
								step="1"
								inputmode="numeric"
								bind:value={slice.pct}
								aria-label="Slice {i + 1} percent"
							/>
							<span aria-hidden="true">%</span>
						</span>
						<span class="slice-amount nums"
							>${Math.round((potSize * (Number(slice.pct) || 0)) / 100).toLocaleString()}</span
						>
						<button class="btn btn--ghost btn--sm" onclick={() => removeSlice(i)}>Remove</button>
					</div>
				{/each}

				<div class="row">
					<!-- One button per table, each handing out the next seat down it.
					     Press either as many times as you want to pay that deep. -->
					<button
						class="btn btn--ghost btn--sm"
						onclick={() => addPlacement('final')}
						disabled={full || nextFree('final') === undefined}
						title="The next unpaid place in the final standings"
						>Add a place</button
					>
					<button
						class="btn btn--ghost btn--sm"
						onclick={() => addPlacement('regular')}
						disabled={full || nextFree('regular') === undefined}
						title="The next unpaid place in the regular season"
						>Add a regular-season place</button
					>
					<span class="faint nums" class:danger={!splitOk}>
						{splitTotal}% of 100%
					</span>
				</div>

				{#if full}
					<p class="faint">
						That is all {MAX_SLICES} slices. Remove one to pay a different placement.
					</p>
				{/if}

				{#if splitProblems.length}
					<div class="notice notice--danger">
						<strong>Fix this before saving</strong> — the board prints every figure as a
						percentage of the pot.
						<ul>
							{#each splitProblems as problem (problem)}<li>{problem}</li>{/each}
						</ul>
					</div>
				{/if}

				{#if splitOk && potSplit.length}
					<h3 class="rail">What that pays</h3>
					<ul class="preview">
						{#each payouts(potSplit.map((x) => ({ ...x, pct: Number(x.pct) || 0 })), potSize) as cut (cut.label)}
							<li><strong>{cut.label}</strong> — ${cut.amount.toLocaleString()}</li>
						{/each}
					</ul>
				{/if}

				<div class="row">
					<button class="btn btn--primary" onclick={savePot} disabled={!splitOk || !!busy}>
						{busy === 'pot saved' ? 'Saving…' : 'Save the pot'}
					</button>
				</div>
			</section>

			<section class="card">
				<h2 class="display">Who has paid</h2>
				<p class="q-help">
					Tap a name to mark them paid. Each tap saves on its own, so you can do this from your
					phone while somebody is handing you cash, and two people marking two different players
					will not revert each other.
				</p>

				<p class="faint">
					<strong class="nums">{paidCount}</strong> of {data.players.length} paid ·
					<strong class="nums">${collected.toLocaleString()}</strong> of ${potSize.toLocaleString()}
					in
					{#if paidCount < data.players.length}
						· <strong class="nums">${(potSize - collected).toLocaleString()}</strong> outstanding
					{/if}
				</p>

				<div class="marks">
					{#each data.players as p (p.id)}
						{@const isPaid = paidSet.has(p.id)}
						<button
							class="mark"
							class:mark--paid={isPaid}
							aria-pressed={isPaid}
							disabled={marking === p.id || !!busy}
							onclick={() => togglePaid(p.id, p.display_name, !isPaid)}
						>
							<span class="mark-tick" aria-hidden="true">{isPaid ? '✓' : '✗'}</span>
							<span class="mark-name">{p.display_name}</span>
							<span class="mark-state">{isPaid ? 'paid' : 'owes'}</span>
						</button>
					{/each}
				</div>
			</section>
		{:else if leagueTab === 'sleeper'}
			<section class="card">
				<h2 class="display">Sleeper accounts</h2>
				<p class="q-help">
					Nobody in this league uses their real name as a handle, so nothing links itself.
					Suggestions below are guesses from the handle and team name — confirm the ones that
					are right and pick the rest yourself. A wrong link credits someone else's results to
					you, so nothing is applied automatically.
				</p>

				{#if data.sleeper.accounts.length === 0}
					<p class="notice">
						No Sleeper data cached yet. Deploy the sync worker, or run it once, and this fills
						in.
					</p>
				{:else}
					<p class="faint">
						{data.sleeper.accounts.length} Sleeper accounts · {linkedCount} of {data.players.length}
						players linked{data.sleeper.fetchedAt ? ` · synced ${data.sleeper.fetchedAt}` : ''}
					</p>

					<div class="links">
						{#each data.players as p (p.id)}
							{@const sug = data.sleeper.suggestions[p.id]}
							<div class="link-row">
								<span class="who">{p.display_name}</span>

								<select
									aria-label="Sleeper account for {p.display_name}"
									value={p.sleeperUserId ?? ''}
									onchange={(e) => setLink(p.id, e.currentTarget.value)}
								>
									<option value="">— not linked —</option>
									{#each data.sleeper.accounts as a (a.userId)}
										<option value={a.userId}>
											{a.displayName}{a.teamName ? ` · ${a.teamName}` : ''}
										</option>
									{/each}
								</select>

								{#if p.sleeperUserId}
									<span class="badge badge--open">Linked</span>
								{:else if sug}
									<button
										class="btn btn--ghost sug"
										disabled={!!busy}
										onclick={() => setLink(p.id, sug.userId)}
										title={sug.why}
									>
										Use {accountName(sug.userId)} ({confidence(sug.score)})
									</button>
								{:else}
									<span class="badge badge--draft">No guess</span>
								{/if}
							</div>
						{/each}
					</div>

					{#if unclaimed.length}
						<p class="faint" style="margin-top:var(--s-4)">
							Sleeper accounts nobody claims yet: {unclaimed.join(', ')}
						</p>
					{/if}
				{/if}
			</section>
		{/if}
	{/if}
</div>

<style>
	/* ── The Pot tab ───────────────────────────────────────────────────────── */

	.pot-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
		gap: var(--s-3);
		margin-bottom: var(--s-4);
	}

	.pot-field {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: var(--s-1);
		padding: var(--s-3) var(--s-4);
		border-radius: var(--r-md);
		border: 1px solid var(--border);
		background: var(--surface-2);
	}

	.pot-field .down-tag {
		margin-bottom: var(--s-1);
	}

	/* The currency mark belongs to the field, not to the number — typing over a
	   value should never mean re-typing a "$". */
	.pot-input {
		display: inline-flex;
		align-items: baseline;
		gap: 2px;
		font-family: var(--font-display);
		font-size: var(--t-lg);
	}

	.pot-input input {
		width: 6ch;
		border: 0;
		border-bottom: 2px solid var(--border-strong);
		border-radius: 0;
		background: transparent;
		padding: 0 2px;
		font: inherit;
		color: inherit;
		font-variant-numeric: tabular-nums;
	}

	.pot-input input:focus-visible {
		outline: none;
		border-bottom-color: var(--accent-ink);
	}

	.pot-input--pct {
		font-size: var(--t-base);
	}

	.pot-input--pct input {
		width: 4ch;
	}

	.pot-total {
		font-family: var(--font-display);
		font-size: var(--t-xl);
		line-height: 1;
		color: var(--accent-ink);
		font-variant-numeric: tabular-nums;
	}

	.slice {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto 84px auto;
		gap: var(--s-3);
		align-items: center;
		padding: var(--s-2) 0;
		border-bottom: 1px solid var(--border);
	}

	.slice > select {
		min-width: 0;
	}

	.slice-amount {
		text-align: right;
		font-weight: 800;
		font-variant-numeric: tabular-nums;
		color: var(--accent-ink);
	}

	@media (max-width: 560px) {
		.slice {
			grid-template-columns: minmax(0, 1fr) auto auto;
		}

		.slice > select {
			grid-column: 1 / -1;
		}
	}

	/* The paid list. One button per player, big enough to hit on a phone while
	   somebody is handing you a twenty. */
	.marks {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
		gap: var(--s-2);
	}

	.mark {
		display: grid;
		grid-template-columns: 20px minmax(0, 1fr) auto;
		gap: var(--s-3);
		align-items: center;
		min-height: var(--tap);
		padding: var(--s-2) var(--s-3);
		border-radius: var(--r-sm);
		border: 1px solid var(--border);
		background: var(--danger-soft);
		box-shadow: inset 3px 0 0 var(--danger);
		color: inherit;
		font: inherit;
		text-align: left;
		cursor: pointer;
		transition: background var(--dur-1) var(--ease), box-shadow var(--dur-1) var(--ease),
			transform var(--dur-1) var(--ease);
	}

	.mark--paid {
		background: var(--ok-soft);
		box-shadow: inset 3px 0 0 var(--ok);
	}

	.mark:active:not(:disabled) {
		transform: translateY(1px);
	}

	.mark:disabled {
		opacity: 0.55;
		cursor: default;
	}

	.mark-tick {
		font-weight: 900;
		line-height: 1;
		color: var(--danger);
	}

	.mark--paid .mark-tick {
		color: var(--ok);
	}

	.mark-name {
		font-weight: 700;
		overflow-wrap: anywhere;
	}

	.mark-state {
		font-family: var(--font-mono);
		font-size: var(--t-xs);
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--danger);
	}

	.mark--paid .mark-state {
		color: var(--ok);
	}

	.preview {
		margin: 0 0 var(--s-4);
		padding-left: var(--s-5);
		font-size: var(--t-sm);
	}

	.danger {
		color: var(--danger);
		font-weight: 800;
	}

	/* ── The split ─────────────────────────────────────────────────────────
	   Two big plates above the tab rail, because the choice they carry is not
	   a peer of the choice below them: one picks whether you are reading or
	   writing, the other picks what. Sized and labelled so the difference is
	   readable before anything is pressed. */
	.split {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: var(--s-2);
		margin-bottom: var(--s-3);
	}

	.split button {
		display: flex;
		align-items: center;
		gap: var(--s-3);
		padding: var(--s-3) var(--s-4);
		border-radius: var(--r-md);
		border: 2px solid var(--border-strong);
		background: var(--surface-2);
		color: var(--ink-soft);
		text-align: left;
		cursor: pointer;
		transition: border-color var(--dur-1) var(--ease), background var(--dur-1) var(--ease),
			color var(--dur-1) var(--ease), transform var(--dur-1) var(--ease);
	}

	.split button span {
		display: flex;
		flex-direction: column;
		gap: 2px;
		min-width: 0;
	}

	.split button strong {
		font-family: var(--font-display);
		font-size: var(--t-md);
		text-transform: uppercase;
		letter-spacing: 0.02em;
		line-height: 1.1;
	}

	.split button i {
		font-style: normal;
		font-size: var(--t-xs);
		line-height: 1.35;
		color: var(--ink-faint);
	}

	.split button.on {
		border-color: var(--gold);
		background: var(--accent-soft);
		color: var(--ink);
		box-shadow: 0 0 0 4px rgb(212 160 23 / 14%);
	}

	.split button.on i {
		color: var(--ink-soft);
	}

	.split button:active {
		transform: translateY(1px);
	}

	@media (hover: hover) {
		.split button:not(.on):hover {
			border-color: var(--gold);
		}
	}

	/* Under 520px the subtitles are what breaks first — they wrap to four lines
	   and push the rail off the screen. The names alone still carry it. */
	@media (max-width: 520px) {
		.split button {
			padding: var(--s-2) var(--s-3);
		}

		.split button i {
			display: none;
		}
	}

	/* The original's tab rail: a dark inset trough on the turf with the active
	   tab punched out in chalk. Scrolls sideways rather than wrapping, so the
	   desk keeps one row of tabs on a phone. */
	.tabs {
		display: flex;
		gap: var(--s-1);
		overflow-x: auto;
		padding: var(--s-1);
		margin-bottom: var(--s-4);
		border-radius: var(--r-md);
		background: rgb(0 0 0 / 22%);
		-webkit-overflow-scrolling: touch;
		scrollbar-width: none;
	}

	.tabs::-webkit-scrollbar {
		display: none;
	}

	.tabs button {
		flex: 1 0 auto;
		min-height: 40px;
		padding: 0 var(--s-4);
		border-radius: var(--r-sm);
		border: 0;
		background: transparent;
		color: var(--chalk-dim);
		font-size: var(--t-sm);
		font-weight: 800;
		white-space: nowrap;
		cursor: pointer;
		transition: background var(--dur-1) var(--ease), color var(--dur-1) var(--ease),
			transform var(--dur-1) var(--ease);
	}

	.tabs button:active {
		transform: scale(0.97);
	}

	/* Five league tabs fill the trough and look deliberate. Two survey tabs
	   stretched to half the desk each, and the active one landed as a slab of
	   chalk wide enough to read as a banner rather than a tab. This rail sizes
	   to its labels and lets the trough run on. */
	.tabs--fit button {
		flex: 0 0 auto;
	}

	@media (hover: hover) {
		.tabs button:not(.on):hover {
			background: rgb(255 255 255 / 10%);
			color: var(--gold-bright);
		}
	}

	.tabs button.on {
		background: var(--chalk);
		color: var(--turf-dark);
	}

	/* Turnout on the tab itself: which survey still needs chasing is the
	   question you came to the Surveys side to answer, and it should not cost a
	   press per survey to find out. */
	.tab-n {
		margin-left: 6px;
		font-family: var(--font-mono);
		font-style: normal;
		font-size: 10px;
		font-weight: 800;
		letter-spacing: 0.04em;
		opacity: 0.72;
		font-variant-numeric: tabular-nums;
	}

	.survey-head {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: var(--s-3);
		margin-bottom: var(--s-2);
	}

	.survey-head .q-help {
		margin: var(--s-1) 0 0;
	}

	.survey-actions {
		margin: var(--s-3) 0 var(--s-4);
	}

	/* A button that has to read as a link, because it goes somewhere — it just
	   goes somewhere inside the page rather than at the end of an href. */
	.linky {
		border: 0;
		background: none;
		padding: 0;
		font: inherit;
		color: var(--accent-ink);
		text-decoration: underline;
		cursor: pointer;
	}

	.ctl {
		padding: var(--s-4);
		margin-bottom: var(--s-3);
		border: 1px solid var(--border);
		border-radius: var(--r-md);
		background: var(--surface-2);
	}

	.ruled {
		display: flex;
		align-items: center;
		gap: var(--s-2);
	}

	.head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--s-3);
		margin-bottom: var(--s-4);
	}

	.watcher {
		display: flex;
		gap: 6px;
		flex: 0 0 auto;
	}

	.watcher i {
		width: 18px;
		height: 18px;
		border-radius: 50%;
		background: var(--chalk);
		border: 1px solid var(--border-strong);
		position: relative;
		overflow: hidden;
	}

	/* The pupil moves inside the eye; the eye itself stays put. */
	.watcher i::after {
		content: '';
		position: absolute;
		inset: 4px;
		border-radius: 50%;
		background: var(--turf-dark);
		translate: var(--px, 0) var(--py, 0);
		transition: translate var(--dur-2) var(--ease);
	}

	.ctl-head {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		gap: var(--s-3);
		margin-bottom: var(--s-3);
	}

	.ctl-head p {
		margin-top: 2px;
	}

	.audit {
		margin: var(--s-5) 0;
		font-size: var(--t-sm);
	}

	.audit ul {
		margin: var(--s-2) 0 0;
		padding-left: var(--s-4);
	}

	.audit code {
		font-family: var(--font-mono);
		font-size: var(--t-xs);
	}

	.suggest {
		margin: 0 0 var(--s-4);
		padding-left: var(--s-4);
	}

	.pair {
		padding: var(--s-4) 0;
		border-top: 1px solid var(--border);
	}

	.pair-head {
		display: flex;
		justify-content: space-between;
		gap: var(--s-2);
		margin-bottom: var(--s-3);
	}

	.pun-field {
		display: block;
		margin-bottom: var(--s-4);
	}

	.pun-field .down-tag {
		display: inline-block;
		margin-bottom: var(--s-2);
	}

	.pun-field textarea,
	.pun-field input {
		width: 100%;
		margin: 0;
	}

	.line {
		padding: var(--s-3);
		margin-bottom: var(--s-2);
		border-radius: var(--r-md);
		background: var(--surface-2);
		border: 1px solid var(--border);
	}

	/* Named as well as shown — the Desk is read at a glance, and a bare square
	   of colour does not survive being glanced at. */
	.swatch {
		display: inline-block;
		width: 0.85em;
		height: 0.85em;
		vertical-align: -0.1em;
		margin-right: 0.2em;
		border-radius: 3px;
		border: 1px solid var(--border-strong);
		background: var(--c);
	}

	.line-head {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: var(--s-2);
	}

	.line-head .down-tag {
		margin: 0;
	}

	/* Settled at nothing is still settled, but it is not a value and should not
	   be shouted like one. */
	.settled--none {
		font-weight: 600;
		font-style: italic;
		color: var(--ink-soft);
	}

	.settled {
		font-weight: 800;
		margin: var(--s-2) 0;
	}

	.line .row {
		margin-top: var(--s-3);
		flex-wrap: nowrap;
	}

	.line .row input {
		flex: 1;
		min-width: 0;
	}

	.links {
		display: flex;
		flex-direction: column;
		gap: var(--s-2);
		margin-top: var(--s-3);
	}

	.link-row {
		display: grid;
		grid-template-columns: minmax(120px, 180px) minmax(0, 1fr) auto;
		gap: var(--s-3);
		align-items: center;
		padding: var(--s-2) var(--s-3);
		border-radius: var(--r-md);
		background: var(--surface-2);
		border: 1px solid var(--border);
	}

	.who {
		font-weight: 700;
	}

	.sug {
		white-space: nowrap;
	}

	@media (max-width: 620px) {
		.link-row {
			grid-template-columns: minmax(0, 1fr);
		}
	}
</style>
