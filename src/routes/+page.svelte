<script lang="ts">
	import { slide, fly } from 'svelte/transition';
	import { STATUS_META } from '$lib/status';
	import type { SurveyStatus } from '$lib/server/db';
	import { reveal, countUp, onKonami } from '$lib/motion';
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

<div class="shell">
	<section class="card">
		<!-- The crest at full size, once, as the page's opening statement. It is
		     decorative here: the banner above already names the league. -->
		<img class="crest--hero" src="/logo-256.png" alt="" width="256" height="256" />
		<div class="down-tag"><Icon name="clipboard" size={13} /> League business</div>
		<h2 class="display headline">Anything marked open still needs you</h2>
		<p class="q-help">
			Closed surveys stay readable — you can always go back and see what you put. The results move
			to the boards and stay there permanently, which is a threat.
		</p>

		<div class="kv-grid">
			<div class="kv" use:reveal={{ index: 0 }}>
				<span class="kv-i"><Icon name="stopwatch" size={17} /></span>
				<span class="kv-v nums" use:countUp={{ value: openNow }}>{openNow}</span>
				<span class="kv-k">open now</span>
			</div>
			<div class="kv" use:reveal={{ index: 1 }}>
				<span class="kv-i"><Icon name="helmet" size={17} /></span>
				<span class="kv-v nums gold" use:countUp={{ value: data.rosterSize }}>{data.rosterSize}</span>
				<span class="kv-k">dickheads</span>
			</div>
			<div class="kv" use:reveal={{ index: 2 }}>
				<span class="kv-i"><Icon name="scoreboard" size={17} /></span>
				<span class="kv-v nums" use:countUp={{ value: boardCount }}>{boardCount}</span>
				<span class="kv-k">boards live</span>
			</div>
		</div>
	</section>

	<h2 class="rail">Surveys</h2>

	{#if live.length === 0}
		<div class="card">
			<p class="muted">{EMPTY.noSurveys}</p>
		</div>
	{/if}

	<div class="stack">
		{#each live as s, i (s.id)}
			{@const meta = STATUS_META[s.status as SurveyStatus]}
			<a class="tile tile--{s.status}" href="/s/{s.id}" use:reveal={{ index: i }}>
				<div class="tile-head">
					<span class="tile-title">{s.title}</span>
					<span class="badge badge--{s.status}">{meta.hubLabel}</span>
				</div>
				<p class="q-help">{s.blurb}</p>
				<div class="tile-foot">
					<span class="faint nums">{s.count} / {data.rosterSize} in</span>
					<div class="meter" class:meter--live={s.status === 'open'} aria-hidden="true">
						<i style="width:{pct(s.count)}%"></i>
					</div>
					<span class="cta">{CTA[s.status as SurveyStatus]} <Icon name="chevron" size={13} /></span>
				</div>
			</a>
		{/each}
	</div>

	<h2 class="rail">Permanent boards</h2>

	<div class="stack">
		{#each data.boards as b, i (b.id)}
			<a class="tile tile--board" href="/b/{b.id}" use:reveal={{ index: i }}>
				<div class="tile-head">
					<span class="tile-title">{b.title}</span>
					<span class="badge badge--board">Always on</span>
				</div>
				<p class="q-help">{b.blurb}</p>
				<div class="tile-foot">
					<span class="cta">Open the board <Icon name="chevron" size={13} /></span>
				</div>
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
	.headline {
		font-size: var(--t-lg);
		margin-bottom: var(--s-2);
		text-wrap: balance;
	}

	/* Section rails sit on the turf between cards, in chalk, the way the old
	   hub separated its groups. */
	.rail {
		margin: var(--s-5) var(--s-1) var(--s-3);
		font-family: var(--font-mono);
		font-size: 11px;
		font-weight: 800;
		letter-spacing: 0.16em;
		text-transform: uppercase;
		color: var(--on-field-dim);
		opacity: 0.72;
	}

	.tile {
		position: relative;
		display: block;
		padding: var(--s-4) var(--s-4) var(--s-4) var(--s-5);
		border-radius: var(--r-md);
		background: var(--surface);
		box-shadow: var(--shadow-sm);
		text-decoration: none;
		overflow: hidden;
		transition: transform var(--dur-2) var(--ease), box-shadow var(--dur-2) var(--ease);
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
		margin-bottom: var(--s-1);
		flex-wrap: wrap;
	}

	.tile-title {
		font-family: var(--font-display);
		text-transform: uppercase;
		font-size: var(--t-md);
		line-height: 1.15;
	}

	.tile-foot {
		display: flex;
		align-items: center;
		gap: var(--s-3);
		margin-top: var(--s-3);
		padding-top: var(--s-3);
		border-top: 1px dashed var(--border);
		flex-wrap: wrap;
	}

	.tile-foot .meter {
		flex: 1 1 90px;
		min-width: 70px;
		max-width: 180px;
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
