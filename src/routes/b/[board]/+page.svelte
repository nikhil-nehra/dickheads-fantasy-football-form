<script lang="ts">
	import { page } from '$app/state';
	import { BOARDS } from '$lib/boards';
	import { fieldStatus } from '$lib/negotiation';
	import SurveyTally from '$lib/components/SurveyTally.svelte';
	import { allQuestions } from '$lib/surveys/types';
	import { singleTally, allocationAverage } from '$lib/tally';

	let { data } = $props();

	let copied = $state(false);

	async function copyLink() {
		try {
			await navigator.clipboard.writeText(page.url.href);
			copied = true;
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

	/* ── Link preview ─────────────────────────────────────────────────────── */

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
				<h2>{data.board.title}</h2>
				<p class="q-help">{data.board.blurb}</p>
			</div>
			<button class="btn btn--ghost" onclick={copyLink}>
				{copied ? 'Copied ✓' : 'Copy link for Sleeper'}
			</button>
		</div>

		{#if data.kind === 'rivalry'}
			{#if data.verdict?.punishment}
				<div class="verdict">
					<span class="down-tag red">The punishment</span>
					<p class="verdict-text">{data.verdict.punishment}</p>
					{#if data.verdict.targetLabel}
						<p class="q-help">
							Served by: <strong>{data.verdict.targetLabel}</strong>
							{#if data.verdict.who}
								— currently <strong>{data.verdict.who}</strong>, per Sleeper.
							{/if}
						</p>
					{/if}
				</div>
			{/if}

			{#if rivalrySummary}
				<div class="stats">
					<div><strong>{rivalrySummary.pairs}</strong><span>rivalries</span></div>
					<div><strong>{rivalrySummary.settled}</strong><span>lines agreed</span></div>
					<div>
						<strong>{rivalrySummary.total - rivalrySummary.settled}</strong><span
							>still arguing</span
						>
					</div>
				</div>
			{/if}

			{#if data.pairings.length === 0}
				<p class="muted">No rivalries posted yet.</p>
			{/if}

			{#each data.pairings as p (p.id)}
				<div class="pair">
					<h3>{p.aName} <span class="vs">vs</span> {p.bName}</h3>
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
								class:badge--draft={st.state === 'open'}
								class:badge--archived={st.state === 'forced'}
							>
								{#if st.state === 'agreed'}Agreed{:else if st.state === 'forced'}Ruled{:else if st.state === 'waiting'}In dispute{:else}Not set{/if}
							</span>
						</div>
					{/each}
				</div>
			{/each}
		{:else if data.kind === 'standings'}
			{#if !data.standings}
				<p class="muted">
					No Sleeper data yet. Set <code>SLEEPER_LEAGUE_ID</code> and let the sync worker run.
				</p>
			{:else}
				<div class="scroll-x">
					<table>
						<thead>
							<tr><th>Team</th><th>W</th><th>L</th><th>T</th><th>PF</th><th>PA</th></tr>
						</thead>
						<tbody>
							{#each data.standings as row (row.rosterId)}
								<tr>
									<td>{row.displayName}</td>
									<td>{row.wins}</td>
									<td>{row.losses}</td>
									<td>{row.ties}</td>
									<td>{row.pointsFor.toFixed(1)}</td>
									<td>{row.pointsAgainst.toFixed(1)}</td>
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
			<div class="stats">
				<div><strong>{pot.winner.label}</strong><span>winning buy-in</span></div>
				<div><strong>${pot.projected.toLocaleString()}</strong><span>pot if everyone's in</span></div>
				<div><strong>${pot.collected.toLocaleString()}</strong><span>from the {data.submissions.length} who answered</span></div>
			</div>

			{#each pot.rows as r (r.id)}
				<div class="bar">
					<span>{r.label}</span>
					<div class="meter"><i style="width:{r.pct}%"></i></div>
					<span class="faint">{r.n} votes</span>
				</div>
			{/each}

			{#if pot.split && pot.split.respondents}
				<h3>The split</h3>
				{#each pot.split.buckets as b}
					<div class="bar">
						<span>{b.label}</span>
						<div class="meter"><i style="width:{b.pct}%"></i></div>
						<span class="faint">{b.pct}% · {money(b.pct, pot.projected)}</span>
					</div>
				{/each}
				{#if pot.split.carveOut}
					<div class="bar">
						<span>{pot.split.carveOut.label}</span>
						<div class="meter"><i style="width:{pot.split.carveOut.pct}%"></i></div>
						<span class="faint"
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
		min-height: var(--tap);
		display: inline-flex;
		align-items: center;
		padding: 0 var(--s-4);
		border-radius: var(--r-pill);
		border: 1px solid rgb(244 239 226 / 30%);
		color: var(--chalk-dim);
		font-weight: 700;
		font-size: var(--t-sm);
		text-decoration: none;
	}

	.board-tabs a[aria-current='page'] {
		background: var(--chalk);
		color: var(--turf-dark);
		border-color: var(--chalk);
	}

	.board-head {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		gap: var(--s-3);
		flex-wrap: wrap;
		margin-bottom: var(--s-4);
	}

	.verdict {
		padding: var(--s-4);
		margin-bottom: var(--s-5);
		border-radius: var(--r-md);
		border: 2px solid var(--danger);
		background: var(--danger-soft);
	}

	.verdict-text {
		font-family: var(--font-display);
		font-size: var(--t-lg);
		font-weight: 800;
		margin-bottom: var(--s-2);
	}

	.stats {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
		gap: var(--s-3);
		margin-bottom: var(--s-5);
	}

	.stats div {
		padding: var(--s-3);
		border-radius: var(--r-md);
		background: var(--surface-2);
		border: 1px solid var(--border);
		text-align: center;
	}

	.stats strong {
		display: block;
		font-size: var(--t-lg);
		font-family: var(--font-display);
	}

	.stats span {
		font-size: var(--t-xs);
		color: var(--ink-soft);
		text-transform: uppercase;
		letter-spacing: 0.06em;
	}

	.pair {
		padding: var(--s-4) 0;
		border-top: 1px solid var(--border);
	}

	.pair h3 {
		font-size: var(--t-md);
		margin-bottom: var(--s-3);
	}

	.vs {
		color: var(--gold);
		font-family: var(--font-display);
		font-style: italic;
	}

	.line {
		display: grid;
		grid-template-columns: 130px minmax(0, 1fr) auto;
		gap: var(--s-3);
		align-items: center;
		padding: var(--s-2) 0;
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
		font-size: var(--t-xs);
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--ink-soft);
	}

	h3 {
		font-size: var(--t-base);
		margin: var(--s-4) 0 var(--s-2);
	}
</style>
