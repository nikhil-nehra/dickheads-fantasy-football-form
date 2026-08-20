<script lang="ts">
	import { slide, fly } from 'svelte/transition';
	import { STATUS_META } from '$lib/status';
	import type { SurveyStatus } from '$lib/server/db';
	import { countUp, onKonami } from '$lib/motion';
	import { EMPTY } from '$lib/voice';
	import Icon from '$lib/components/Icon.svelte';

	let { data } = $props();

	// Already filtered server-side: drafts only reach a commissioner's browser.
	let live = $derived(data.surveys.filter((s) => s.status !== 'archived'));
	let archived = $derived(data.surveys.filter((s) => s.status === 'archived'));
	let openNow = $derived(live.filter((s) => s.status === 'open').length);
	let boardCount = $derived(data.boards.length);

	let showArchive = $state(false);
	let audible = $state(false);

	$effect(() => onKonami(() => (audible = true)));

	const CTA: Record<SurveyStatus, string> = {
		open: 'Fill it in',
		closed: 'See your answers',
		draft: 'Preview it',
		archived: 'See your answers'
	};

	function pct(count: number): number {
		return data.rosterSize ? Math.round((count / data.rosterSize) * 100) : 0;
	}
</script>

<svelte:head>
	<title>The Dickhead's League</title>
	<meta
		name="description"
		content="Surveys, boards and a commissioner's desk for a 14-person fantasy football league."
	/>
</svelte:head>

<div class="shell shell--hub">
	<!-- No crest here. The banner directly above this carries the same badge;
	     a second copy cost 170px of scroll to say nothing new. -->
	<section class="card intro">
		<div class="intro-text">
			<div class="down-tag"><Icon name="clipboard" size={13} /> League business</div>
			<h2 class="display headline">Anything marked open still needs you</h2>
			<p class="q-help">Closed surveys stay readable. The boards are permanent, which is a threat.</p>
		</div>

		<!-- Inline rather than three stacked tiles: same three numbers, one row
		     instead of a 110px grid. -->
		<div class="stats">
			<span class="stat">
				<Icon name="stopwatch" size={16} />
				<b class="nums" use:countUp={{ value: openNow }}>{openNow}</b> open
			</span>
			<span class="stat">
				<Icon name="helmet" size={16} />
				<b class="nums" use:countUp={{ value: data.rosterSize }}>{data.rosterSize}</b> dickheads
			</span>
			<span class="stat">
				<Icon name="scoreboard" size={16} />
				<b class="nums" use:countUp={{ value: boardCount }}>{boardCount}</b> boards
			</span>
		</div>
	</section>

	<h2 class="rail">Surveys</h2>

	{#if live.length === 0}
		<div class="card"><p class="muted">{EMPTY.noSurveys}</p></div>
	{/if}

	<div class="grid">
		{#each live as s (s.id)}
			{@const meta = STATUS_META[s.status as SurveyStatus]}
			<a class="tile tile--{s.status}" href="/s/{s.id}">
				<div class="tile-head">
					<span class="tile-title">{s.title}</span>
					<span class="badge badge--{s.status}">{meta.hubLabel}</span>
				</div>
				<p class="q-help">{s.blurb}</p>
				<div class="tile-foot">
					<span class="faint nums">{s.count}/{data.rosterSize}</span>
					<div class="meter" class:meter--live={s.status === 'open'} aria-hidden="true">
						<i style="width:{pct(s.count)}%"></i>
					</div>
					<span class="cta">{CTA[s.status as SurveyStatus]} <Icon name="chevron" size={12} /></span>
				</div>
			</a>
		{/each}
	</div>

	<h2 class="rail">Permanent boards</h2>

	<!-- Boards carry no badge and no footer. Every one of them was "Always on"
	     above an "Open the board →" that repeated what the whole tile already
	     is — two rows per card saying nothing. -->
	<div class="grid grid--tight">
		{#each data.boards as b (b.id)}
			<a class="tile tile--board" href="/b/{b.id}">
				<div class="tile-head">
					<span class="tile-title">{b.title}</span>
					<Icon name="chevron" size={13} class="tile-go" />
				</div>
				<p class="q-help">{b.blurb}</p>
			</a>
		{/each}
	</div>

	{#if archived.length}
		<h2 class="rail">Archive</h2>

		<button class="archive-toggle" onclick={() => (showArchive = !showArchive)}
			aria-expanded={showArchive}>
			{showArchive ? '▲ HIDE' : '▼ SHOW'}
			{archived.length} ARCHIVED SURVEY{archived.length === 1 ? '' : 'S'}
		</button>

		{#if showArchive}
			<div class="stack" style="margin-top:var(--s-3)" transition:slide={{ duration: 260 }}>
				{#each archived as s (s.id)}
					<a class="tile tile--archived" href="/s/{s.id}">
						<div class="tile-head">
							<span class="tile-title">{s.title}</span>
							<span class="badge badge--archived">Archived</span>
						</div>
						<span class="faint nums">{s.count} / {data.rosterSize} answered</span>
					</a>
				{/each}
			</div>
		{/if}
	{/if}

	{#if audible}
		<!-- ↑↑↓↓←→←→BA. Nothing here does anything; that is the joke. -->
		<div class="card audible" transition:fly={{ y: 12, duration: 320 }}>
			<div class="down-tag red">Audible</div>
			<p class="q-text">You typed the Konami code into a fantasy football form.</p>
			<p class="q-help">
				No bonus points. No secret board. The commissioner has been notified and thinks less of you.
			</p>
			<button class="btn btn--ghost btn--sm" onclick={() => (audible = false)}>Pretend this
				didn't happen</button>
		</div>
	{/if}
</div>

<style>
	/* Header and stats sit side by side and only stack when there is genuinely
	   no room, which is the whole trick: use the width, not the height. */
	.intro {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--s-4);
		flex-wrap: wrap;
		padding: var(--s-4);
	}

	.intro-text {
		flex: 1 1 300px;
		min-width: 0;
	}

	.headline {
		font-size: var(--t-lg);
		margin-bottom: var(--s-1);
		text-wrap: balance;
	}

	.intro .q-help {
		margin-bottom: 0;
	}

	.stats {
		display: flex;
		flex-wrap: wrap;
		gap: var(--s-2);
		flex: 0 1 auto;
	}

	.stat {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: var(--s-2) var(--s-3);
		border: 1px solid var(--border);
		border-radius: var(--r-pill);
		background: var(--surface-2);
		font-size: var(--t-sm);
		color: var(--ink-soft);
		white-space: nowrap;
	}

	.stat :global(.icon) {
		color: var(--ink-faint);
	}

	.stat b {
		font-family: var(--font-display);
		font-size: var(--t-md);
		color: var(--ok);
		line-height: 1;
	}

	/* Section rails sit on the turf between cards, in chalk, the way the old
	   hub separated its groups. */
	.rail {
		margin: var(--s-4) var(--s-1) var(--s-2);
		font-family: var(--font-mono);
		font-size: 11px;
		font-weight: 800;
		letter-spacing: 0.16em;
		text-transform: uppercase;
		color: var(--on-field-dim);
		opacity: 0.72;
	}

	/* Tiles go two and three across instead of one per row. Six cards that
	   filled a screen and a half now fit in roughly half of one. */
	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(270px, 1fr));
		gap: var(--s-3);
	}

	.grid--tight {
		grid-template-columns: repeat(auto-fill, minmax(210px, 1fr));
	}

	.tile {
		position: relative;
		display: block;
		padding: var(--s-3) var(--s-3) var(--s-3) var(--s-4);
		border-radius: var(--r-md);
		background: var(--surface);
		box-shadow: var(--shadow-sm);
		text-decoration: none;
		overflow: hidden;
		transition: transform var(--dur-2) var(--ease), box-shadow var(--dur-2) var(--ease);
	}

	.tile .q-help {
		margin-bottom: 0;
	}

	.tile :global(.tile-go) {
		color: var(--accent-ink);
		transition: transform var(--dur-2) var(--ease);
	}

	@media (hover: hover) {
		.tile:hover :global(.tile-go) {
			transform: translateX(3px);
		}
	}

	/* Status reads as a coloured spine down the left edge before you get to
	   the badge — the fastest scan on the page. */
	.tile::after {
		content: '';
		position: absolute;
		inset: 0 auto 0 0;
		width: 5px;
		background: var(--spine, var(--turf-mid));
	}

	.tile--open {
		--spine: var(--turf-line);
	}

	.tile--closed {
		--spine: var(--endzone);
	}

	.tile--draft,
	.tile--board {
		--spine: var(--gold);
	}

	.tile--archived {
		--spine: var(--border-strong);
		opacity: 0.82;
	}

	@media (hover: hover) {
		.tile:hover {
			transform: translateY(-2px);
			box-shadow: var(--shadow-lift);
		}

		.tile:hover .cta {
			transform: translateX(3px);
		}
	}

	.tile:active {
		transform: translateY(0) scale(0.995);
	}

	.tile-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--s-2);
		margin-bottom: 2px;
		flex-wrap: wrap;
	}

	.tile-title {
		font-family: var(--font-display);
		text-transform: uppercase;
		font-size: var(--t-base);
		line-height: 1.15;
	}

	/* No rule above it and no padding either side of one: the row reads as the
	   bottom of the card without costing 25px to say so. */
	.tile-foot {
		display: flex;
		align-items: center;
		gap: var(--s-2);
		margin-top: var(--s-2);
		flex-wrap: nowrap;
	}

	.tile-foot .meter {
		flex: 1 1 40px;
		min-width: 32px;
		height: 6px;
	}

	.cta {
		display: inline-flex;
		align-items: center;
		gap: var(--s-1);
		margin-left: auto;
		font-size: var(--t-sm);
		font-weight: 800;
		color: var(--accent-ink);
		white-space: nowrap;
		transition: transform var(--dur-2) var(--ease);
	}

	.tile--closed .cta {
		color: var(--danger);
	}

	.archive-toggle {
		width: 100%;
		padding: var(--s-3);
		border: 1.5px dashed rgb(230 222 200 / 35%);
		border-radius: var(--r-md);
		background: none;
		color: var(--on-field-dim);
		font-family: var(--font-mono);
		font-size: 11px;
		font-weight: 700;
		letter-spacing: 0.1em;
		cursor: pointer;
		transition: border-color var(--dur-1) var(--ease), color var(--dur-1) var(--ease);
	}

	@media (hover: hover) {
		.archive-toggle:hover {
			border-color: var(--gold);
			color: var(--gold-bright);
		}
	}

	.audible {
		margin-top: var(--s-4);
		border: 2px solid var(--danger);
	}
</style>
