<script lang="ts">
	import { page } from '$app/state';
	import { BOARDS } from '$lib/boards';
	import { fieldStatus } from '$lib/negotiation';
	import SurveyTally from '$lib/components/SurveyTally.svelte';
	import { allQuestions } from '$lib/surveys/types';
	import { singleTally, allocationAverage } from '$lib/tally';
	import { reveal, countUp, flash } from '$lib/motion';
	import { EMPTY, roast, lastPlaceNote } from '$lib/voice';
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

	// The pot is a PROJECTION over the full roster, not money collected. The old
	// board printed the same number as a flat fact.
	let pot = $derived.by(() => {
		if (data.kind !== 'survey' || data.board.id !== 'pot') return null;
		const q = allQuestions(data.def).find((x) => x.id === 'buyIn');
		if (!q || q.type !== 'single') return null;
		const rows = singleTally(q, data.submissions);
		const winner = rows[0];
		if (!winner) return null;
		const amount = Number(winner.id) || 0;
		const alloc = allQuestions(data.def).find((x) => x.type === 'allocation');
		return {
			rows,
			winner,
			amount,
			projected: amount * data.roster.length,
			collected: amount * data.submissions.length,
			split:
				alloc && alloc.type === 'allocation'
					? allocationAverage(alloc, data.submissions)
					: null
		};
	});

	/* ── The naming and shaming ───────────────────────────────────────────── */

	let missing = $derived.by(() => {
		if (data.kind !== 'survey') return null;
		const answered = new Set(data.submissions.map((s) => s.playerId));
		return data.roster.filter((p) => !answered.has(p.id)).map((p) => p.display_name);
	});

	let missingRoast = $derived(missing ? roast(missing, data.roster.length) : null);

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
		if (pot) return `${data.board.og.title} — $${pot.projected.toLocaleString()} on the line`;
		return data.board.og.title;
	});

	let ogDescription = $derived(data.board.og.description);
	let ogImage = $derived(`${page.url.origin}/og/board.png`);

	function money(p: number, of: number): string {
		return `$${Math.round((of * p) / 100).toLocaleString()}`;
	}

	const dollars = (n: number) => `$${Math.round(n).toLocaleString()}`;
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

		{#if missingRoast}
			<p class="roast">{missingRoast}</p>
		{/if}

		{#if data.kind === 'rivalry'}
			{#if data.verdict?.punishment}
				<div class="verdict" use:reveal>
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
					<div class="kv" use:reveal={{ index: 0 }}>
						<span class="kv-i"><Icon name="helmet" size={17} /></span>
						<span class="kv-v nums" use:countUp={{ value: rivalrySummary.pairs }}
							>{rivalrySummary.pairs}</span
						>
						<span class="kv-k">rivalries</span>
					</div>
					<div class="kv" use:reveal={{ index: 1 }}>
						<span class="kv-i"><Icon name="signal" size={17} /></span>
						<span class="kv-v nums" use:countUp={{ value: rivalrySummary.settled }}
							>{rivalrySummary.settled}</span
						>
						<span class="kv-k">lines agreed</span>
					</div>
					<div class="kv" use:reveal={{ index: 2 }}>
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
				{#each data.pairings as p, i (p.id)}
					<article class="pair" use:reveal={{ index: i, step: 50 }}>
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
		{:else if data.board.id === 'pot' && pot}
			<div class="kv-grid">
				<div class="kv" use:reveal={{ index: 0 }}>
					<span class="kv-i"><Icon name="clipboard" size={17} /></span>
					<span class="kv-v sm">{pot.winner.label}</span>
					<!-- .kv-k uppercases in CSS, so these labels stay lower case in the
					     source — which is also what the end-to-end tests read. -->
					<span class="kv-k">winning buy-in</span>
				</div>
				<div class="kv" use:reveal={{ index: 1 }}>
					<span class="kv-i"><Icon name="trophy" size={17} /></span>
					<span class="kv-v nums gold" use:countUp={{ value: pot.projected, format: dollars }}
						>{dollars(pot.projected)}</span
					>
					<span class="kv-k">pot if everyone's in</span>
				</div>
				<div class="kv" use:reveal={{ index: 2 }}>
					<span class="kv-i"><Icon name="football" size={17} /></span>
					<span class="kv-v nums" use:countUp={{ value: pot.collected, format: dollars }}
						>{dollars(pot.collected)}</span
					>
					<span class="kv-k">from the {data.submissions.length} who answered</span>
				</div>
			</div>

			<h3 class="rail">The vote</h3>
			{#each pot.rows as r, i (r.id)}
				<div class="bar" use:reveal={{ index: i, step: 40 }}>
					<span>{r.label}</span>
					<div class="meter meter--live"><i style="width:{r.pct}%"></i></div>
					<span class="faint nums">{r.n} votes</span>
				</div>
			{/each}

			{#if pot.split && pot.split.respondents}
				<h3 class="rail">The split</h3>
				{#each pot.split.buckets as b, i}
					<div class="bar" use:reveal={{ index: i, step: 40 }}>
						<span>{b.label}</span>
						<div class="meter"><i style="width:{b.pct}%"></i></div>
						<span class="faint nums">{b.pct}% · {money(b.pct, pot.projected)}</span>
					</div>
				{/each}
				{#if pot.split.carveOut}
					<div class="bar" use:reveal>
						<span>{pot.split.carveOut.label}</span>
						<div class="meter"><i style="width:{pot.split.carveOut.pct}%"></i></div>
						<span class="faint nums"
							>{pot.split.carveOut.pct}% · {money(pot.split.carveOut.pct, pot.projected)}</span
						>
					</div>
				{/if}
			{/if}
		{:else if data.kind === 'survey'}
			<SurveyTally
				def={data.def}
				submissions={data.submissions}
				roster={data.roster}
				ballots={data.ballots}
			/>
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

	.rail {
		margin: var(--s-5) 0 var(--s-3);
		font-family: var(--font-mono);
		font-size: 11px;
		font-weight: 800;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--ink-soft);
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

	/* Label first at a bounded width, then the meter takes the slack — the
	   other way round leaves a short label stranded beside a tiny bar. */
	.bar {
		display: grid;
		grid-template-columns: minmax(120px, 260px) minmax(0, 1fr) auto;
		gap: var(--s-3);
		align-items: center;
		margin-bottom: var(--s-2);
		font-size: var(--t-sm);
		font-weight: 600;
	}

	@media (max-width: 560px) {
		.bar {
			grid-template-columns: minmax(0, 1fr) auto;
		}

		.bar .meter {
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
