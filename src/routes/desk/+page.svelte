<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import PinPad from '$lib/components/PinPad.svelte';
	import SurveyTally from '$lib/components/SurveyTally.svelte';
	import { STATUS_META, ALL_STATUSES } from '$lib/status';
	import { fieldStatus } from '$lib/negotiation';
	import { autoPair } from '$lib/pairing';
	import { confidence } from '$lib/sleeperMatch';
	import type { SurveyStatus } from '$lib/server/db';
	import type { NegotiationQuestion } from '$lib/surveys/types';
	import { allQuestions } from '$lib/surveys/types';
	import { reduced } from '$lib/motion';
	import Icon from '$lib/components/Icon.svelte';

	let { data } = $props();

	let tab = $state('control');
	let busy = $state('');
	let flash = $state('');
	let error = $state('');

	/* ── "The commissioner sees all" ────────────────────────────────────────
	   A pair of eyes on the League Control card that follow the pointer. They
	   do nothing and control nothing; they are here because the original kept
	   promising the commissioner was watching and never once showed it. */
	let eyes = $state<HTMLElement | null>(null);
	let pupil = $state({ x: 0, y: 0 });

	function trackEyes(e: PointerEvent) {
		if (!eyes || tab !== 'control' || reduced()) return;
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

	let negFields = $derived(
		(rivalrySurvey
			? (allQuestions(rivalrySurvey.def).find((q) => q.type === 'negotiation') as
					| NegotiationQuestion
					| undefined)
			: undefined
		)?.fields ?? []
	);

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

		<div class="tabs" role="tablist" aria-label="Desk sections">
			<button
				role="tab"
				aria-selected={tab === 'control'}
				class:on={tab === 'control'}
				onclick={() => (tab = 'control')}>League Control</button
			>
			{#each data.surveys as s (s.def.id)}
				<button
					role="tab"
					aria-selected={tab === s.def.id}
					class:on={tab === s.def.id}
					onclick={() => (tab = s.def.id)}>{s.def.short}</button
				>
			{/each}
			<button
				role="tab"
				aria-selected={tab === 'rivalries'}
				class:on={tab === 'rivalries'}
				onclick={() => (tab = 'rivalries')}>Rivalries</button
			>
			<button
				role="tab"
				aria-selected={tab === 'sleeper'}
				class:on={tab === 'sleeper'}
				onclick={() => (tab = 'sleeper')}>Sleeper</button
			>
		</div>

		{#if tab === 'control'}
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
		{:else if tab === 'rivalries'}
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
										<p class="settled">{st.value}</p>
									{/if}

									<p class="faint">
										{p.aName}: {st.myProposal ?? '—'} (backing {st.myPick ?? '—'}) ·
										{p.bName}: {st.theirProposal ?? '—'} (backing {st.theirPick ?? '—'})
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
						</div>
					{/each}
				{/if}
			</section>
		{:else if tab === 'sleeper'}
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
		{:else}
			{@const s = data.surveys.find((x) => x.def.id === tab)}
			{#if s}
				<section class="card">
					<h2 class="display">{s.def.title}</h2>
					<SurveyTally
						def={s.def}
						submissions={s.submissions}
						roster={data.players}
						ballots={s.ballots}
					/>
				</section>
			{/if}
		{/if}
	{/if}
</div>

<style>
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

	.line {
		padding: var(--s-3);
		margin-bottom: var(--s-2);
		border-radius: var(--r-md);
		background: var(--surface-2);
		border: 1px solid var(--border);
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
