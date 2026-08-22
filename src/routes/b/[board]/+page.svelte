<script lang="ts">
	import { page } from '$app/state';
	import { BOARDS } from '$lib/boards';
	import { fieldStatus, heatFrom, isNone, ownValue, type Entry, type FieldState } from '$lib/negotiation';
	import { countdown } from '$lib/draft';
	import { isMoney } from '$lib/money';
	import { countUp } from '$lib/motion';
	import { DRAFT, EMPTY, PAID_UP, RIVALRY, burgerRoast, duesRoast, lastPlaceNote } from '$lib/voice';
	import Icon from '$lib/components/Icon.svelte';
	import RivalryHeader from '$lib/components/RivalryHeader.svelte';
	import type { TeamColors } from '$lib/rivalryPattern';

	/* ── Team colours ────────────────────────────────────────────────────────
	   Both picked in the rivalry survey, on a line with no second side to
	   satisfy: your colours are yours, and matching your rival is the one
	   outcome the header cannot draw.

	   Grey is what a team who has not picked gets. It is the honest way to say
	   "not chosen" rather than inventing a colour and having it change under
	   people later, and it costs the board exactly what it should: with no
	   colour to tell two halves apart, the header falls back to scale and
	   mirrored teeth, which is a duller card than the one they would have had.

	   Nothing here validates a hex. `parseHex` returns null on anything it
	   cannot read and the generator substitutes its own fallback, so a colour
	   typed by a person is incapable of breaking this page. */
	const UNPICKED: TeamColors = { primary: '#8a8a8a', secondary: '#8a8a8a' };

	let { data } = $props();

	/* One side's pair of picks. `data.colorKeys` is in the order the survey
	   declares them — primary first — so this board never names a field key. */
	function colorsOf(entries: Entry[]): TeamColors {
		if (data.kind !== 'rivalry') return UNPICKED;
		const [primaryKey, secondaryKey] = data.colorKeys;
		return {
			primary: (primaryKey && ownValue(primaryKey, entries)) || UNPICKED.primary,
			secondary: (secondaryKey && ownValue(secondaryKey, entries)) || UNPICKED.secondary
		};
	}

	/* ── Live headline numbers, which also drive the link preview ─────────── */

	let rivalrySummary = $derived.by(() => {
		if (data.kind !== 'rivalry') return null;
		let settled = 0;
		let total = 0;
		for (const p of data.pairings) {
			for (const f of data.fields) {
				total++;
				const st = fieldStatus(f.key, p.a, p.b, p.rulings);
				if (st.state === 'agreed' || st.state === 'forced') settled++;
			}
		}
		return { pairs: data.pairings.length, settled, total };
	});


	/* ── One rivalry card ─────────────────────────────────────────────────── */

	/* The header is built from settled data, not from the raw entries: the title
	   is the agreed rivalry NAME, the subtitle is the two teams, and the humans
	   move to the footer. A pair who have not agreed a name yet still get a
	   card — with the nag where the name should be. */
	type Pairing = Extract<typeof data, { kind: 'rivalry' }>['pairings'][number];

	function rivalryCard(p: Pairing) {
		if (data.kind !== 'rivalry') throw new Error('rivalryCard on a non-rivalry board');

		const settledIn = (key: string) => {
			const st = fieldStatus(key, p.a, p.b, p.rulings);
			return st.state === 'agreed' || st.state === 'forced';
		};

		const named = data.nameKey
			? fieldStatus(data.nameKey, p.a, p.b, p.rulings)
			: { value: null };

		// The name counts toward the heat even though it is not a body row — it
		// is one of the three things the two of them have to settle.
		const settled =
			data.fields.filter((f) => settledIn(f.key)).length +
			(data.nameKey && settledIn(data.nameKey) ? 1 : 0);

		/* Both of these lines are OPTIONAL, so there are four settled shapes and
		   all of them are correct: no bet and no forfeit, one or the other, or
		   both. The card must not make any of them look like a card that failed
		   to load — which is why "agreed there isn't one" is rendered as a
		   statement and never as a blank or a "not set".

		   Only the UNSETTLED lines get the label-and-badge treatment. Once a
		   line is agreed the badge is noise: everything on this board is agreed,
		   that is what the board is.

		   The one oddity: a bet saved before this line became numeric holds
		   prose, and prose does not go in a 110px tile — it falls back to a
		   normal row so the value stays readable. */
		type Slot = { f: (typeof data.fields)[number]; st: FieldState };

		const stakes: Slot[] = [];
		const lines: Slot[] = [];
		const pending: Slot[] = [];

		for (const f of data.fields) {
			const st = fieldStatus(f.key, p.a, p.b, p.rulings);

			if (st.state !== 'agreed' && st.state !== 'forced') {
				pending.push({ f, st });
			} else if (isNone(st.value)) {
				// Settled at nothing, so there is nothing to draw. A line the two
				// of them agreed not to have is not a gap in the card and does not
				// get a sentence explaining its own absence — a rivalry with only
				// a bet should read as a rivalry that is about the bet.
				continue;
			} else if (f.kind === 'money' && st.value && isMoney(st.value)) {
				stakes.push({ f, st });
			} else {
				lines.push({ f, st });
			}
		}

		return {
			stakes,
			lines,
			pending,
			/* Nothing agreed and nothing outstanding: the card is the name, the
			   teams and the two of them. That is the whole rivalry, so the body
			   is not rendered at all rather than rendered empty. */
			empty: stakes.length === 0 && lines.length === 0 && pending.length === 0,
			/* One stake and nothing else — it gets the card to itself rather than
			   sitting in a narrow column with dead space beside it. */
			soloStake: stakes.length > 0 && lines.length === 0 && pending.length === 0,
			heat: heatFrom(settled),
			name: named.value,
			// Not linked to Sleeper yet? Fall back to the roster name, so the
			// title card is never blank while the Desk catches up.
			aTeam: p.aTeam ?? p.aName,
			bTeam: p.bTeam ?? p.bName
		};
	}

	/* ── The two clocks ───────────────────────────────────────────────────── */

	/* Until the interval below mounts, both the server and the first client
	   render use the timestamp the loader stamped — so hydration has nothing to
	   disagree about. After that the reader's own clock takes over. */
	let tick = $state<number | null>(null);
	let now = $derived(tick ?? (data.kind === 'draft' ? data.now : 0));

	$effect(() => {
		if (data.kind !== 'draft') return;
		tick = Date.now();
		const id = setInterval(() => (tick = Date.now()), 1000);
		return () => clearInterval(id);
	});

	let toDraft = $derived(
		data.kind === 'draft' && data.startsAt ? countdown(now, data.startsAt) : null
	);

	let toChallenge = $derived(
		data.kind === 'draft' ? countdown(now, data.challengeClosesAt) : null
	);

	/* ── The naming and shaming ───────────────────────────────────────────── */

	let unpaid = $derived(
		data.kind === 'pot' ? duesRoast(data.owing.map((p) => p.name), data.roster.length) : null
	);

	let burger = $derived(
		data.kind === 'draft'
			? burgerRoast(
					data.pending.map((p) => p.name),
					data.roster.length
				)
			: null
	);

	// Fewest wins, then fewest points — the same order every league table uses
	// to decide who is genuinely last rather than merely unlucky.
	let cellar = $derived.by(() => {
		if (data.kind !== 'standings' || !data.standings?.length) return null;
		return [...data.standings].sort((a, b) => a.wins - b.wins || a.pointsFor - b.pointsFor)[0];
	});

	/* ── Link preview ─────────────────────────────────────────────────────── */

	/* Deliberately plain. The on-page copy has teeth; the unfurl in Sleeper
	   chat is what a stranger sees first, and a broken-looking preview does not
	   get clicked. */
	let ogTitle = $derived.by(() => {
		if (rivalrySummary && rivalrySummary.total) {
			return `${data.board.og.title} — ${rivalrySummary.settled}/${rivalrySummary.total} settled`;
		}
		if (data.kind === 'pot' && data.pot) {
			return `${data.board.og.title} — $${data.pot.toLocaleString()} on the line`;
		}
		if (data.kind === 'draft' && data.daysOut !== null) {
			return data.daysOut === 0
				? `${data.board.og.title} — today`
				: `${data.board.og.title} — ${data.daysOut} day${data.daysOut === 1 ? '' : 's'} out`;
		}
		return data.board.og.title;
	});

	let ogDescription = $derived(data.board.og.description);
	let ogImage = $derived(`${page.url.origin}/og/board.png`);

	const dollars = (n: number) => `$${Math.round(n).toLocaleString()}`;

	const pad = (n: number) => String(n).padStart(2, '0');
</script>

<svelte:head>
	<title>{data.board.title} — The Dickhead's League</title>
	<meta name="description" content={ogDescription} />

	<!-- The whole distribution plan is pasting these links into Sleeper league
	     chat. The old site had no OG tags on any page, so every one of those
	     links unfurled as a bare URL with no title, description or image. -->
	<meta property="og:type" content="website" />
	<meta property="og:site_name" content="The Dickhead's League" />
	<meta property="og:title" content={ogTitle} />
	<meta property="og:description" content={ogDescription} />
	<meta property="og:image" content={ogImage} />
	<meta property="og:url" content={page.url.href} />
	<meta name="twitter:card" content="summary_large_image" />
	<meta name="twitter:title" content={ogTitle} />
	<meta name="twitter:description" content={ogDescription} />
	<meta name="twitter:image" content={ogImage} />
</svelte:head>

{#snippet stateBadge(st: FieldState)}
	<span
		class="badge"
		class:badge--open={st.state === 'agreed'}
		class:badge--closed={st.state === 'waiting'}
		class:badge--archived={st.state === 'open'}
		class:badge--draft={st.state === 'forced'}
	>
		{#if st.state === 'agreed'}Agreed{:else if st.state === 'forced'}Ruled{:else if st.state === 'waiting'}In dispute{:else}Not set{/if}
	</span>
{/snippet}

<div class="shell shell--wide">
	<nav class="board-tabs" aria-label="Boards">
		{#each BOARDS as b (b.id)}
			<a href="/b/{b.id}" aria-current={b.id === data.board.id ? 'page' : undefined}>{b.title}</a>
		{/each}
	</nav>

	<section class="card">
		<div class="board-head">
			<div class="board-head__lede">
				<div class="down-tag gold"><Icon name="scoreboard" size={13} /> Permanent record</div>
				<h2 class="display board-title">{data.board.title}</h2>
				<p class="q-help">{data.board.blurb}</p>
			</div>

			{#if rivalrySummary}
				<!-- One readout rather than three tiles. See "The tally" below. -->
				<div class="tally">
					<div class="tally__lead">
						<span class="tally__v nums" use:countUp={{ value: rivalrySummary.pairs }}
							>{rivalrySummary.pairs}</span
						>
						<span class="tally__k">rivalries</span>
					</div>
					<div class="tally__cell">
						<span class="tally__v nums" use:countUp={{ value: rivalrySummary.settled }}
							>{rivalrySummary.settled}</span
						>
						<span class="tally__k">lines agreed</span>
					</div>
					<div class="tally__cell">
						<span
							class="tally__v nums danger"
							use:countUp={{ value: rivalrySummary.total - rivalrySummary.settled }}
							>{rivalrySummary.total - rivalrySummary.settled}</span
						>
						<span class="tally__k">still arguing</span>
					</div>
				</div>
			{/if}
		</div>

		{#if data.kind === 'pot'}
			<p class="roast">{unpaid ?? PAID_UP}</p>
		{/if}

		{#if data.kind === 'rivalry'}
			{#if data.verdict?.punishment}
				<div class="verdict">
					<div class="down-tag red"><Icon name="flag" size={13} /> The punishment</div>
					<p class="verdict-text display">{data.verdict.punishment}</p>
					{#if data.verdict.targetLabel}
						<p class="q-help">
							Served by: <strong>{data.verdict.targetLabel}</strong>
							{#if data.verdict.who}
								— currently <strong>{data.verdict.who}</strong>, per Sleeper. Sleep well.
							{/if}
						</p>
					{/if}
					<span class="stamp" aria-hidden="true">RULING{'\n'}STANDS</span>
				</div>
			{/if}

			{#if data.pairings.length === 0}
				<p class="empty">{EMPTY.noPairings}</p>
			{/if}

			<div class="pairs">
				{#each data.pairings as p, i (p.id)}
					{@const card = rivalryCard(p)}
					<article class="pair">
						<!-- The two teams' colours, woven as houndstooth either side of a
						     gap, on the page's own surface. Everything about how that is
						     built lives in the component. -->
						<RivalryHeader
							colorA={colorsOf(p.a)}
							colorB={colorsOf(p.b)}
							name={card.name}
							unnamedLabel={RIVALRY.unnamed}
							teamA={card.aTeam}
							teamB={card.bTeam}
							heat={card.heat}
							heatLabel={card.heat > 0 ? RIVALRY.heat(card.heat) : ''}
							stagger={i}
							badges={false}
						/>

						{#if !card.empty}
							<div
								class="pair-body"
								class:pair-body--solo={card.soloStake}
								class:pair-body--wide={card.stakes.length === 0}
							>
								<!-- The bet is a bounded number, so it lives in a tile it
								     cannot outgrow. The punishment is a sentence, so it takes
								     the slack beside it. -->
								{#each card.stakes as { f, st } (f.key)}
									<div class="stake">
										<span class="stake-amount nums">{st.value}</span>
										<span class="stake-label">{f.short}</span>
									</div>
								{/each}

								{#if card.lines.length || card.pending.length}
									<div class="forfeits">
										{#each card.lines as { f, st } (f.key)}
											<div class="settled">
												<span class="settled-label">{f.short}</span>
												<p class="line-value">{st.value}</p>
											</div>
										{/each}

										<!-- Only the unsettled lines carry a label and a badge. -->
										{#each card.pending as { f, st } (f.key)}
											<div class="line">
												<span class="down-tag">{f.short}</span>
												{@render stateBadge(st)}
											</div>
										{/each}
									</div>
								{/if}
							</div>
						{/if}

						<!-- The humans on the hook, kept off the title card but not hidden:
						     the team plays, the owner pays. -->
						<footer class="pair-foot">
							<span class="owner">{p.aName}</span>
							<span class="owner-sep" aria-hidden="true">·</span>
							<span class="owner">{p.bName}</span>
						</footer>
					</article>
				{/each}
			</div>
		{:else if data.kind === 'standings'}
			{#if !data.standings}
				<p class="empty">
					{EMPTY.noStandings} Set <code>SLEEPER_LEAGUE_ID</code> and let the sync worker run.
				</p>
			{:else}
				{#if cellar}
					<p class="roast">{lastPlaceNote(cellar.displayName)}</p>
				{/if}

				<div class="scroll-x">
					<table>
						<thead>
							<tr><th>Team</th><th>W</th><th>L</th><th>T</th><th>PF</th><th>PA</th></tr>
						</thead>
						<tbody>
							{#each data.standings as row (row.rosterId)}
								<tr class:cellar={cellar?.rosterId === row.rosterId}>
									<td>{row.displayName}</td>
									<td class="nums">{row.wins}</td>
									<td class="nums">{row.losses}</td>
									<td class="nums">{row.ties}</td>
									<td class="nums">{row.pointsFor.toFixed(1)}</td>
									<td class="nums">{row.pointsAgainst.toFixed(1)}</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
				{#if data.fetchedAt}
					<p class="faint">Updated {data.fetchedAt} UTC, straight from Sleeper.</p>
				{/if}
			{/if}
		{:else if data.kind === 'draft'}
			<!-- ── Clock one: first pick ──────────────────────────────────── -->
			{#if !data.startsAt}
				<p class="empty">{EMPTY.noDraftDate}</p>
			{:else}
				<div class="clock" class:clock--live={toDraft?.done}>
					<div class="down-tag red">
						<Icon name="stopwatch" size={13} />
						{toDraft?.done ? 'On the clock' : 'Until first pick'}
					</div>

					{#if toDraft?.done}
						<p class="clock-live display">DRAFT DAY</p>
					{:else if toDraft}
						<div class="dials nums" aria-hidden="true">
							<span class="dial"><b>{toDraft.days}</b><i>days</i></span>
							<span class="dial"><b>{pad(toDraft.hours)}</b><i>hrs</i></span>
							<span class="dial"><b>{pad(toDraft.minutes)}</b><i>min</i></span>
							<span class="dial"><b>{pad(toDraft.seconds)}</b><i>sec</i></span>
						</div>
						<!-- The dials are decoration for a screen reader; this is the
						     sentence it actually reads, and it stays a live region so a
						     reader is told when the draft opens. -->
						<p class="sr-only" aria-live="polite">
							{toDraft.days} days, {toDraft.hours} hours and {toDraft.minutes} minutes until
							first pick.
						</p>
					{/if}

					<p class="clock-when display">{data.startsAtLabel}</p>
					<p class="q-help">
						{toDraft?.done ? DRAFT.live : DRAFT.waiting}
						{#if data.draftType && data.rounds}
							· {data.rounds}-round {data.draftType}{#if data.pickTimer}, {data.pickTimer}s
								per pick{/if}
						{/if}
					</p>
				</div>
			{/if}

			<!-- ── Clock two: the burger deadline ─────────────────────────── -->
			<div class="deadline" class:deadline--gone={toChallenge?.done}>
				<span class="down-tag {toChallenge?.done ? 'red' : 'gold'}">
					<Icon name="flame" size={13} />
					{toChallenge?.done ? 'Kitchen closed' : 'Burger challenge closes'}
				</span>
				{#if toChallenge && !toChallenge.done}
					<span class="deadline-clock nums"
						>{toChallenge.days}d {pad(toChallenge.hours)}h {pad(toChallenge.minutes)}m {pad(
							toChallenge.seconds
						)}s</span
					>
				{/if}
				<span class="faint">{data.challengeClosesLabel}</span>
			</div>

			{#if burger}
				<p class="roast">{burger}</p>
			{:else}
				<p class="roast">{DRAFT.locked}</p>
			{/if}

			<!-- ── The order ──────────────────────────────────────────────── -->
			<h3 class="rail">The order · fastest burger picks first</h3>

			{#if data.picks.length === 0}
				<p class="empty">{EMPTY.noRuns}</p>
			{:else}
				<ol class="order">
					{#each data.picks as p (p.playerId)}
						<li class="slot" class:slot--first={p.pick === 1}>
							<span class="slot-pick nums">{p.pick}</span>
							<span class="slot-name">{p.name}</span>
							<div class="meter" aria-hidden="true"><i style="width:{p.pct}%"></i></div>
							<span class="slot-time nums">{p.clock}</span>
						</li>
					{/each}
				</ol>
			{/if}

			{#if data.pending.length}
				<h3 class="rail">Still eating · unseeded</h3>
				<ul class="waiting">
					{#each data.pending as p (p.id)}
						<li class="chip chip--sm">{p.name}</li>
					{/each}
				</ul>
				{#if toChallenge?.done}
					<p class="q-help">{DRAFT.forfeit}</p>
				{/if}
			{/if}

			{#if data.fetchedAt}
				<p class="faint">Draft time last read from Sleeper {data.fetchedAt}.</p>
			{/if}
		{:else if data.kind === 'pot'}
			{#if !data.buyIn}
				<p class="empty">{EMPTY.noBuyIn}</p>
			{:else}
				<div class="kv-grid">
					<div class="kv">
						<span class="kv-i"><Icon name="clipboard" size={17} /></span>
						<!-- .kv-k uppercases in CSS, so these labels stay lower case in
						     the source — which is also what the end-to-end tests read. -->
						<span class="kv-v nums">{dollars(data.buyIn)}</span>
						<span class="kv-k">buy-in</span>
					</div>
					<div class="kv">
						<span class="kv-i"><Icon name="trophy" size={17} /></span>
						<span class="kv-v nums gold" use:countUp={{ value: data.pot, format: dollars }}
							>{dollars(data.pot)}</span
						>
						<span class="kv-k">the pot · {data.roster.length} in</span>
					</div>
					<div class="kv">
						<span class="kv-i"><Icon name="football" size={17} /></span>
						<span
							class="kv-v nums"
							class:danger={data.collected < data.pot}
							use:countUp={{ value: data.collected, format: dollars }}>{dollars(data.collected)}</span
						>
						<span class="kv-k">collected so far</span>
					</div>
				</div>

				<!-- ── The split ──────────────────────────────────────────────── -->
				<h3 class="rail">The split · where {dollars(data.pot)} lands</h3>

				{#if data.payouts.length === 0}
					<p class="empty">{EMPTY.noSplit}</p>
				{:else}
					<ol class="cuts">
						{#each data.payouts as cut, i (cut.label)}
							<li class="cut" class:cut--first={i === 0}>
								<span class="cut-label">{cut.label}</span>
								<div class="meter" aria-hidden="true"><i style="width:{cut.pct}%"></i></div>
								<span class="cut-pct faint nums">{cut.pct}%</span>
								<span class="cut-amount nums">{dollars(cut.amount)}</span>
							</li>
						{/each}
					</ol>
				{/if}

				<!-- ── Who has paid ───────────────────────────────────────────── -->
				<h3 class="rail">Who has paid</h3>

				<div class="ledger">
					{#each data.paid as r (r.playerId)}
						<div class="payer payer--paid">
							<span class="tick" aria-hidden="true">✓</span>
							<span class="payer-name">{r.name}</span>
							<span class="payer-state nums">paid</span>
						</div>
					{/each}
					{#each data.owing as r (r.playerId)}
						<div class="payer payer--owing">
							<span class="tick" aria-hidden="true">✗</span>
							<span class="payer-name">{r.name}</span>
							<span class="payer-state nums">owes {dollars(data.buyIn)}</span>
						</div>
					{/each}
				</div>
			{/if}
		{/if}
	</section>
</div>

<style>
	.board-tabs {
		display: flex;
		flex-wrap: wrap;
		gap: var(--s-2);
		margin-bottom: var(--s-4);
	}

	.board-tabs a {
		min-height: 40px;
		display: inline-flex;
		align-items: center;
		padding: 0 var(--s-4);
		border-radius: var(--r-pill);
		border: 1px solid rgb(240 194 66 / 40%);
		color: var(--on-field-dim);
		font-weight: 700;
		font-size: var(--t-sm);
		text-decoration: none;
		transition: color var(--dur-1) var(--ease), border-color var(--dur-1) var(--ease),
			background var(--dur-1) var(--ease), transform var(--dur-1) var(--ease);
	}

	.board-tabs a[aria-current='page'] {
		background: var(--chalk);
		color: var(--turf-dark);
		border-color: var(--chalk);
	}

	@media (hover: hover) {
		.board-tabs a:not([aria-current='page']):hover {
			border-color: var(--gold-bright);
			color: var(--gold-bright);
			transform: translateY(-1px);
		}
	}

	.board-head {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: var(--s-3) var(--s-4);
		flex-wrap: wrap;
		margin-bottom: var(--s-4);
	}

	/* Takes the slack so the tally sits hard right, and shrinks first when the
	   header runs out of room. The blurb has its own measure from `.q-help`, so
	   this does not let it run away. */
	.board-head__lede {
		flex: 1 1 22rem;
		min-inline-size: 0;
	}

	/* ── The tally ───────────────────────────────────────────────────────────
	   The same three numbers the board used to open with. As full-width stat
	   tiles they were the first thing on the page and the largest thing on it,
	   which put a summary in front of the fourteen cards that are the actual
	   record.

	   So: one instrument instead of three tiles. A single bordered strip beside
	   the title, cells divided by hairlines rather than floating apart, and no
	   icons — at this size a mark above each number is noise, and the labels are
	   already right there. It reads as a scoreboard readout, which is what it is.

	   The numbers keep their count-up and their colours: settled is `--ok`,
	   outstanding is `--danger`, both theme-flipping tokens rather than the fixed
	   turf green and gold that sit near 2.3:1 on a pale card. */
	.tally {
		flex: 0 0 auto;
		display: grid;
		grid-template-columns: auto auto;
		border: 1px solid var(--border);
		border-radius: var(--r-md);
		background: var(--surface-2);
		/* So the dividers stop at the rounded corners. */
		overflow: hidden;
	}

	/* How many rivalries there are is what the board IS; the other two are
	   readings taken OFF that number. So it leads, in gold, at a size that says
	   so, and they hang from its side. Three equal cells claimed the three
	   figures were equally important, which they are not. */
	.tally__lead {
		grid-row: 1 / 3;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 2px;
		padding: var(--s-3) var(--s-4);
	}

	.tally__lead .tally__v {
		font-size: 34px;
		/* --accent-ink rather than --gold: the raw token is a fixed value that
		   sits near 2.4:1 on a pale card. This one flips per theme. */
		color: var(--accent-ink);
	}

	/* Number and label share a baseline — at this size a stacked pair would be
	   two lines of almost nothing. */
	.tally__cell {
		display: flex;
		align-items: baseline;
		gap: 7px;
		padding: var(--s-2) var(--s-3);
		border-inline-start: 1px solid var(--border);
	}

	.tally__cell + .tally__cell {
		border-block-start: 1px solid var(--border);
	}

	.tally__v {
		font-family: var(--font-display);
		font-size: 15px;
		line-height: 1;
		color: var(--ok);
	}

	.tally__v.danger {
		color: var(--danger);
	}

	.tally__k {
		font-size: 9.5px;
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--ink-faint);
		/* Two-word labels stay on one line; the cell is wide enough for the
		   longest of them. */
		white-space: nowrap;
	}

	.board-title {
		font-size: var(--t-xl);
		margin-bottom: var(--s-1);
	}

	/* The roast. Loud enough to read first, quiet enough not to be mistaken for
	   an error state. */
	.roast {
		margin-bottom: var(--s-4);
		padding: var(--s-3) var(--s-4);
		border-radius: var(--r-md);
		border-left: 4px solid var(--gold);
		background: var(--surface-2);
		color: var(--ink-soft);
		font-size: var(--t-sm);
		font-weight: 700;
		font-style: italic;
	}

	.empty {
		padding: var(--s-6) var(--s-4);
		border: 1.5px dashed var(--border-strong);
		border-radius: var(--r-md);
		background: var(--surface-2);
		color: var(--ink-soft);
		font-size: var(--t-sm);
		text-align: center;
	}

	.verdict {
		position: relative;
		overflow: hidden;
		padding: var(--s-5);
		padding-right: 120px;
		margin-bottom: var(--s-5);
		border-radius: var(--r-md);
		border: 2px solid var(--danger);
		background: var(--danger-soft);
	}

	.verdict-text {
		font-size: var(--t-lg);
		color: var(--danger);
		margin-bottom: var(--s-2);
		text-wrap: balance;
	}

	.verdict .stamp {
		position: absolute;
		top: 50%;
		right: var(--s-3);
		margin-top: -22px;
		opacity: 0.55;
	}

	@media (max-width: 560px) {
		.verdict {
			padding-right: var(--s-5);
		}

		.verdict .stamp {
			display: none;
		}
	}

	/* ── Draft Day ─────────────────────────────────────────────────────────
	   The big clock is the whole page. It gets the scoreboard treatment: turf,
	   yard lines, chalk numerals — the same title-card language as .pair-head,
	   so the two boards read as one site. */
	.clock {
		position: relative;
		overflow: hidden;
		padding: var(--s-5) var(--s-4);
		margin-bottom: var(--s-4);
		border-radius: var(--r-md);
		border: 2px solid var(--turf-line);
		background: linear-gradient(135deg, var(--turf-mid), var(--turf-dark));
		color: var(--chalk);
		text-align: center;
	}

	.clock::before {
		content: '';
		position: absolute;
		inset: 0;
		background: repeating-linear-gradient(90deg, rgb(255 255 255 / 4%) 0 2px, transparent 2px 40px);
		pointer-events: none;
	}

	.clock--live {
		border-color: var(--gold);
	}

	.clock > * {
		position: relative;
	}

	/* The vw terms are deliberately gentle. Between the shell, the card and this
	   panel there is a fixed 112px of padding around these four numerals, so a
	   scale steep enough to look right at 1100px overflows a 360px phone — and
	   a countdown that has lost its days column is worse than a smaller one. */
	.dials {
		display: flex;
		justify-content: center;
		align-items: flex-end;
		gap: clamp(var(--s-2), 3vw, var(--s-6));
		margin: var(--s-2) 0 var(--s-3);
	}

	.dial {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--s-1);
	}

	/* Tabular figures and a fixed minimum width, or the seconds column shoves
	   the whole row sideways once a second. */
	.dial b {
		display: block;
		min-width: 1.8ch;
		font-family: var(--font-display);
		font-size: clamp(28px, 9vw, 64px);
		line-height: 0.95;
		color: var(--chalk);
	}

	.dial i {
		font-family: var(--font-mono);
		font-style: normal;
		font-size: 10px;
		font-weight: 700;
		letter-spacing: 0.16em;
		text-transform: uppercase;
		color: var(--gold-bright);
	}

	.clock-live {
		font-size: clamp(28px, 9vw, 64px);
		color: var(--gold-bright);
		margin: var(--s-2) 0 var(--s-3);
	}

	.clock-when {
		font-size: var(--t-md);
		color: var(--gold-bright);
		margin-bottom: var(--s-1);
	}

	/* Centred inside the scoreboard panel, so the bounded measure has to be
	   centred with it rather than left-aligned under a wide card. */
	.clock .q-help {
		margin: 0 auto;
		color: var(--on-field-dim);
		text-wrap: balance;
	}

	/* The second clock is deliberately a strip, not a card. It is a deadline,
	   not the event. */
	.deadline {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--s-2) var(--s-3);
		padding: var(--s-3) var(--s-4);
		margin-bottom: var(--s-4);
		border-radius: var(--r-md);
		border: 1px solid var(--border);
		border-left: 4px solid var(--accent-ink);
		background: var(--surface-2);
	}

	.deadline--gone {
		border-left-color: var(--danger);
	}

	.deadline .down-tag {
		margin-bottom: 0;
	}

	.deadline-clock {
		font-family: var(--font-mono);
		font-size: var(--t-md);
		font-weight: 800;
		color: var(--ink);
	}

	.order {
		list-style: none;
		margin: 0;
		padding: 0;
	}

	.slot {
		display: grid;
		grid-template-columns: 34px minmax(90px, 200px) minmax(0, 1fr) auto;
		gap: var(--s-3);
		align-items: center;
		padding: var(--s-2) 0;
		border-bottom: 1px solid var(--border);
	}

	.slot:last-child {
		border-bottom: 0;
	}

	.slot-pick {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 28px;
		height: 28px;
		border-radius: 50%;
		background: var(--surface-3);
		color: var(--ink-soft);
		font-family: var(--font-display);
		font-size: var(--t-sm);
	}

	/* First pick earned it. */
	.slot--first .slot-pick {
		background: var(--gold);
		color: #2a1e00;
	}

	.slot--first .slot-name {
		font-family: var(--font-display);
		text-transform: uppercase;
		letter-spacing: 0.01em;
	}

	.slot-name {
		font-weight: 700;
		overflow-wrap: anywhere;
	}

	.slot-time {
		font-family: var(--font-mono);
		font-size: var(--t-sm);
		font-weight: 700;
		color: var(--ink-soft);
	}

	@media (max-width: 560px) {
		.clock {
			padding-left: var(--s-2);
			padding-right: var(--s-2);
		}
	}

	/* Narrow: pick, name and time stay on one line and the bar drops beneath
	   them. Every cell is placed explicitly — leaving the time to auto-flow put
	   it on a third row of its own, under the pick number. */
	@media (max-width: 560px) {
		.slot {
			grid-template-columns: 34px minmax(0, 1fr) auto;
			row-gap: var(--s-2);
		}

		.slot-pick {
			grid-area: 1 / 1;
		}

		.slot-name {
			grid-area: 1 / 2;
		}

		.slot-time {
			grid-area: 1 / 3;
		}

		.slot .meter {
			grid-area: 2 / 2 / 2 / -1;
		}
	}

	/* ── The Pot ───────────────────────────────────────────────────────────
	   The split reads as a table of money, not a chart: label, bar, percent,
	   dollars. The dollars are the column people actually came for, so they sit
	   last and hard right where the eye lands. */
	.cuts {
		list-style: none;
		margin: 0;
		padding: 0;
	}

	.cut {
		display: grid;
		grid-template-columns: minmax(120px, 230px) minmax(0, 1fr) 46px 84px;
		gap: var(--s-3);
		align-items: center;
		padding: var(--s-2) 0;
		border-bottom: 1px solid var(--border);
	}

	.cut:last-child {
		border-bottom: 0;
	}

	.cut-label {
		min-width: 0;
		font-weight: 700;
		line-height: 1.4;
		overflow-wrap: anywhere;
	}

	.cut--first .cut-label,
	.cut--first .cut-amount {
		font-family: var(--font-display);
		text-transform: uppercase;
		letter-spacing: 0.01em;
	}

	.cut-pct {
		text-align: right;
	}

	.cut-amount {
		text-align: right;
		font-weight: 800;
		font-variant-numeric: tabular-nums;
		color: var(--accent-ink);
	}

	@media (max-width: 560px) {
		.cut {
			grid-template-columns: minmax(0, 1fr) 46px 84px;
		}

		.cut-label {
			grid-area: 1 / 1;
		}

		.cut-pct {
			grid-area: 1 / 2;
		}

		.cut-amount {
			grid-area: 1 / 3;
		}

		.cut .meter {
			grid-area: 2 / 1 / 2 / -1;
		}
	}

	/* The ledger. Paid and unpaid are the same row shape — only the spine
	   colour and the tick change — so it scans as one list rather than two
	   lists that happen to be adjacent. */
	.ledger {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
		gap: var(--s-2);
	}

	.payer {
		display: grid;
		grid-template-columns: 20px minmax(0, 1fr) auto;
		gap: var(--s-3);
		align-items: baseline;
		padding: var(--s-2) var(--s-3);
		border-radius: var(--r-sm);
		border: 1px solid var(--border);
		background: var(--surface-2);
	}

	.payer--paid {
		box-shadow: inset 3px 0 0 var(--ok);
	}

	.payer--owing {
		box-shadow: inset 3px 0 0 var(--danger);
		background: var(--danger-soft);
	}

	.tick {
		font-weight: 900;
		line-height: 1;
	}

	.payer--paid .tick {
		color: var(--ok);
	}

	.payer--owing .tick {
		color: var(--danger);
	}

	.payer-name {
		font-weight: 700;
		overflow-wrap: anywhere;
	}

	.payer-state {
		font-family: var(--font-mono);
		font-size: var(--t-xs);
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.06em;
	}

	.payer--paid .payer-state {
		color: var(--ok);
	}

	.payer--owing .payer-state {
		color: var(--danger);
	}

	.waiting {
		display: flex;
		flex-wrap: wrap;
		gap: var(--s-2);
		list-style: none;
		margin: 0 0 var(--s-3);
		padding: 0;
	}

	/* Chips here are labels, not controls — nothing to press, so nothing that
	   looks pressable. */
	.waiting .chip {
		cursor: default;
		opacity: 0.75;
	}

	/* align-items: start so each card is its own content's height. Stretching
	   them to match the tallest in the row left a settled rivalry sitting above
	   90px of empty card, which reads as a rendering fault rather than as
	   breathing room. A ragged bottom edge reads as content. */
	.pairs {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(380px, 1fr));
		align-items: start;
		gap: var(--s-4);
		margin-top: var(--s-5);
	}

	/* A column so the owners footer can be pushed to the bottom: grid rows
	   stretch every card to the tallest in the row, and without this the
	   footer floats halfway up the short ones. */
	.pair {
		/* The body lays itself out against the CARD's width, not the viewport's —
		   these sit in an auto-fill grid, so the viewport says nothing useful
		   about how much room any one card actually got. */
		container-type: inline-size;
		display: flex;
		flex-direction: column;
		border: 1px solid var(--border);
		border-radius: var(--r-md);
		overflow: hidden;
		background: var(--surface-2);
		/* The card already clips its own corners; the header should not round a
		   second set inside them. */
		--rh-radius: 0;
	}

	/* The broadcast title card. Each rivalry gets its own arena — see
	   lib/arenas.ts for why, and for the rule that the base gradient alone
	   carries the contrast. */
	/* The owners. Off the title card — the team plays, the human pays. */
	.pair-foot {
		margin-top: auto;
		display: flex;
		align-items: center;
		justify-content: center;
		flex-wrap: wrap;
		gap: var(--s-2);
		padding: var(--s-2) var(--s-3);
		border-top: 1px solid var(--border);
		background: var(--surface-2);
	}

	.owner {
		font-size: var(--t-xs);
		font-weight: 700;
		color: var(--ink-soft);
	}

	.owner-sep {
		color: var(--ink-faint);
	}

	.pair-body {
		flex: 1 1 auto;
		display: grid;
		gap: var(--s-3);
		padding: var(--s-3) var(--s-4);
		background: var(--surface);
	}

	/* Side by side only once the prose column can still hold a readable line.
	   Below that the tile sits on top as a full-width strip — a 28-character
	   measure beside it would undo the whole point of stacking the text. */
	@container (min-width: 400px) {
		.pair-body {
			grid-template-columns: auto minmax(0, 1fr);
			align-items: start;
		}

		/* No tile to sit beside means no column to reserve — otherwise the prose
		   is laid out against an `auto` track with nothing in the other one. */
		.pair-body--wide {
			grid-template-columns: minmax(0, 1fr);
		}
	}

	/* ── The stake ─────────────────────────────────────────────────────────
	   Its own object, because a bet is only ever an amount. Fixed shape, so
	   it cannot overflow and does not resize between $5 and $500 — and an
	   unset bet keeps the same shape with a dash in it, so a card does not
	   jump about as a rivalry gets settled. */
	.stake {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 2px;
		min-width: 104px;
		padding: var(--s-3);
		border-radius: var(--r-md);
		border: 1.5px solid var(--accent-ink);
		background: var(--accent-soft);
		text-align: center;
	}

	.stake-amount {
		font-family: var(--font-display);
		font-size: var(--t-xl);
		line-height: 1;
		color: var(--accent-ink);
	}

	.stake-label {
		font-family: var(--font-mono);
		font-size: 10px;
		font-weight: 700;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--ink-soft);
	}

	/* On its own row the tile is a strip rather than a square — a 112px block
	   floating alone above the text reads as a stray element. */
	@container (max-width: 399px) {
		.stake {
			flex-direction: row;
			justify-content: flex-start;
			gap: var(--s-3);
			padding: var(--s-2) var(--s-3);
		}

		.stake-amount {
			font-size: var(--t-lg);
		}

	}

	.forfeits {
		min-width: 0;
		display: grid;
		gap: var(--s-3);
		align-content: start;
	}

	/* An agreed line is just the thing itself. The label stays because a
	   sentence on its own does not say which line it settled; the AGREED badge
	   goes, because everything on this board is agreed — that is the board. */
	.settled-label {
		display: block;
		margin-bottom: var(--s-1);
		font-family: var(--font-mono);
		font-size: 10px;
		font-weight: 700;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--ink-faint);
	}

	.settled .line-value {
		margin: 0;
	}

	/* A stake with nothing beside it is the whole point of the card, so it is
	   centred rather than parked in a column that has nothing to line up
	   against. */
	.pair-body--solo {
		grid-template-columns: none;
		justify-items: center;
		padding: var(--s-4);
	}

	@container (min-width: 400px) {
		.pair-body--solo {
			grid-template-columns: none;
		}
	}

	/* A negotiated line is a LABEL, a STATUS and a sentence — and the sentence
	   is the point. Squeezing it into a 1fr column beside a 120px label left it
	   about 120px wide in a 320px card, which turned "Loser Venmos $20 and posts
	   the receipt" into five lines of two words.

	   So the row stacks: the two compact pieces share the top line, and the
	   value gets the card's full width underneath. Nothing is clamped — these
	   are the agreed terms of a bet, and truncating them to make the cards
	   uniform would hide the only thing anybody opens this board to read. */
	/* An unsettled line is only ever a label and a status — there is no value to
	   show yet, and saying "not set" twice was costing an unsettled card a row
	   per field. */
	.line {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--s-3);
	}

	.line .down-tag {
		margin: 0;
	}

	.line-value {
		min-width: 0;
		font-weight: 600;
		/* Body measure, not the 1.02 the display face uses — this is prose now. */
		line-height: 1.5;
		overflow-wrap: anywhere;
		/* Keeps a single word from being stranded on the last line. */
		text-wrap: pretty;
	}

	table {
		width: 100%;
		border-collapse: collapse;
		font-size: var(--t-sm);
	}

	th,
	td {
		padding: var(--s-2) var(--s-3);
		text-align: left;
		border-bottom: 1px solid var(--border);
		white-space: nowrap;
	}

	th {
		font-family: var(--font-mono);
		font-size: var(--t-xs);
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--ink-soft);
	}

	tbody tr {
		transition: background var(--dur-1) var(--ease);
	}

	@media (hover: hover) {
		tbody tr:hover {
			background: var(--surface-2);
		}
	}

	/* Last place gets a red spine. It is a fantasy league; the point is that
	   everyone can see it from the doorway. */
	.cellar td {
		background: var(--danger-soft);
		font-weight: 700;
	}

	.cellar td:first-child {
		box-shadow: inset 3px 0 0 var(--danger);
	}

	code {
		font-family: var(--font-mono);
		font-size: 0.9em;
		padding: 1px 5px;
		border-radius: 4px;
		background: var(--surface-3);
	}
</style>
