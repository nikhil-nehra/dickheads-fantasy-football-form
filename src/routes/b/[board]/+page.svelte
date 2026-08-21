<script lang="ts">
	import { page } from '$app/state';
	import { BOARDS } from '$lib/boards';
	import { fieldStatus } from '$lib/negotiation';
	import { countdown } from '$lib/draft';
	import { countUp, flash } from '$lib/motion';
	import { DRAFT, EMPTY, PAID_UP, burgerRoast, duesRoast, lastPlaceNote } from '$lib/voice';
	import Icon from '$lib/components/Icon.svelte';

	let { data } = $props();

	let copied = $state(false);
	let copyBtn = $state<HTMLButtonElement | null>(null);

	async function copyLink() {
		try {
			await navigator.clipboard.writeText(page.url.href);
			copied = true;
			flash(copyBtn, 'pop');
			setTimeout(() => (copied = false), 2000);
		} catch {
			copied = false;
		}
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

<div class="shell shell--wide">
	<nav class="board-tabs" aria-label="Boards">
		{#each BOARDS as b (b.id)}
			<a href="/b/{b.id}" aria-current={b.id === data.board.id ? 'page' : undefined}>{b.title}</a>
		{/each}
	</nav>

	<section class="card">
		<div class="board-head">
			<div>
				<div class="down-tag gold"><Icon name="scoreboard" size={13} /> Permanent record</div>
				<h2 class="display board-title">{data.board.title}</h2>
				<p class="q-help">{data.board.blurb}</p>
			</div>
			<button class="btn btn--ghost" bind:this={copyBtn} onclick={copyLink}>
				{copied ? 'Copied ✓' : 'Copy link for Sleeper'}
			</button>
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

			{#if rivalrySummary}
				<div class="kv-grid">
					<div class="kv">
						<span class="kv-i"><Icon name="helmet" size={17} /></span>
						<span class="kv-v nums" use:countUp={{ value: rivalrySummary.pairs }}
							>{rivalrySummary.pairs}</span
						>
						<span class="kv-k">rivalries</span>
					</div>
					<div class="kv">
						<span class="kv-i"><Icon name="signal" size={17} /></span>
						<span class="kv-v nums" use:countUp={{ value: rivalrySummary.settled }}
							>{rivalrySummary.settled}</span
						>
						<span class="kv-k">lines agreed</span>
					</div>
					<div class="kv">
						<span class="kv-i"><Icon name="flag" size={17} /></span>
						<span
							class="kv-v nums danger"
							use:countUp={{ value: rivalrySummary.total - rivalrySummary.settled }}
							>{rivalrySummary.total - rivalrySummary.settled}</span
						>
						<span class="kv-k">still arguing</span>
					</div>
				</div>
			{/if}

			{#if data.pairings.length === 0}
				<p class="empty">{EMPTY.noPairings}</p>
			{/if}

			<div class="pairs">
				{#each data.pairings as p (p.id)}
					<article class="pair">
						<header class="pair-head">
							<span class="vs-name">{p.aName}</span>
							<span class="vs-mid" aria-hidden="true">VS</span>
							<span class="vs-name">{p.bName}</span>
						</header>

						<div class="pair-body">
							{#each data.fields as f (f.key)}
								{@const st = fieldStatus(f.key, p.a, p.b, p.rulings)}
								<div class="line">
									<span class="down-tag">{f.short}</span>
									<span class="line-value">
										{#if st.value}{st.value}{:else}<span class="faint">not set</span>{/if}
									</span>
									<span
										class="badge"
										class:badge--open={st.state === 'agreed'}
										class:badge--closed={st.state === 'waiting'}
										class:badge--archived={st.state === 'open'}
										class:badge--draft={st.state === 'forced'}
									>
										{#if st.state === 'agreed'}Agreed{:else if st.state === 'forced'}Ruled{:else if st.state === 'waiting'}In dispute{:else}Not set{/if}
									</span>
								</div>
							{/each}
						</div>
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
		justify-content: space-between;
		align-items: flex-start;
		gap: var(--s-3);
		flex-wrap: wrap;
		margin-bottom: var(--s-4);
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

	.clock .q-help {
		color: var(--on-field-dim);
		margin-bottom: 0;
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
		grid-template-columns: minmax(90px, 170px) minmax(0, 1fr) 46px 84px;
		gap: var(--s-3);
		align-items: center;
		padding: var(--s-2) 0;
		border-bottom: 1px solid var(--border);
	}

	.cut:last-child {
		border-bottom: 0;
	}

	.cut-label {
		font-weight: 700;
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

	.pairs {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
		gap: var(--s-4);
		margin-top: var(--s-5);
	}

	.pair {
		border: 1px solid var(--border);
		border-radius: var(--r-md);
		overflow: hidden;
		background: var(--surface-2);
	}

	/* The broadcast title card: two names on turf with the endzone-red disc
	   between them. Straight out of the original's .vs-block. */
	.pair-head {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: var(--s-3);
		flex-wrap: wrap;
		position: relative;
		padding: var(--s-4) var(--s-3);
		background: linear-gradient(135deg, var(--turf-mid), var(--turf-dark));
		color: var(--chalk);
		text-align: center;
	}

	.pair-head::before {
		content: '';
		position: absolute;
		inset: 0;
		background: repeating-linear-gradient(90deg, rgb(255 255 255 / 4%) 0 2px, transparent 2px 40px);
	}

	.vs-name {
		position: relative;
		font-family: var(--font-display);
		text-transform: uppercase;
		font-size: clamp(14px, 3.4vw, 17px);
		line-height: 1.1;
		overflow-wrap: anywhere;
	}

	.vs-mid {
		position: relative;
		flex: 0 0 auto;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 32px;
		height: 32px;
		border-radius: 50%;
		background: var(--chalk);
		color: var(--endzone);
		font-family: var(--font-display);
		font-size: 12px;
	}

	.pair-body {
		padding: var(--s-3) var(--s-4);
		background: var(--surface);
	}

	.line {
		display: grid;
		grid-template-columns: 120px minmax(0, 1fr) auto;
		gap: var(--s-3);
		align-items: center;
		padding: var(--s-2) 0;
		border-bottom: 1px solid var(--border);
	}

	.line:last-child {
		border-bottom: 0;
	}

	.line .down-tag {
		margin: 0;
	}

	.line-value {
		font-weight: 600;
		overflow-wrap: anywhere;
	}

	@media (max-width: 560px) {
		.line {
			grid-template-columns: minmax(0, 1fr) auto;
		}

		.line .down-tag {
			grid-column: 1 / -1;
		}
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
