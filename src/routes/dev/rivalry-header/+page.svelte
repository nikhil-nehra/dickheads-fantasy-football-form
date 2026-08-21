<script lang="ts">
	/* ═══════════════════════════════════════════════════════════════════════
	   DEV — RIVALRY HEADER
	   ═══════════════════════════════════════════════════════════════════════
	   Not linked from anywhere. This is the bench for judging the pattern
	   generator against the cases that break it, rather than against the three
	   colour pairs that happen to look nice.

	   The theme control writes `data-theme` on the document element, which is
	   the same switch app.css already listens for — so what you see here is the
	   real mechanism, not a preview of it. That does mean one theme at a time:
	   showing both at once would need a per-subtree override, and then the thing
	   on screen would no longer be the thing that ships.
	   ═══════════════════════════════════════════════════════════════════════ */

	import RivalryHeader from '$lib/components/RivalryHeader.svelte';
	import { rivalryPattern, type TeamColors } from '$lib/rivalryPattern';

	type Sample = {
		/** Only a list key — the generator no longer takes a seed. */
		id: string;
		name: string | null;
		teamA: string;
		teamB: string;
		a: TeamColors;
		b: TeamColors;
		/** Why this pair is in the list. */
		note?: string;
	};

	const SAMPLES: Sample[] = [
		{
			id: 'moton:dande',
			name: 'The Roommate Bowl',
			teamA: 'Dande Lions',
			teamB: 'David Moton',
			a: { primary: '#a32638', secondary: '#c9a227' },
			b: { primary: '#173456', secondary: '#b8c4d0' },
			note: 'The easy case — four colours, all well apart.'
		},
		{
			id: 'latin:burns',
			name: 'The Dallas Civil War',
			teamA: 'Ratin Out',
			teamB: 'Lyon Around',
			a: { primary: '#125c62', secondary: '#f0ead6' },
			b: { primary: '#c9a227', secondary: '#5a3a10' }
		},
		{
			id: 'nehra:ali',
			name: 'The Battle for the Last Brain Cell',
			teamA: 'Brain Trust',
			teamB: 'Burger Kings',
			a: { primary: '#4b2a72', secondary: '#9ade3a' },
			b: { primary: '#d2691e', secondary: '#241a12' },
			note: 'A long name, to check the measure holds.'
		},
		{
			id: 'twin:reds',
			name: 'Two Reds, One Bucket',
			teamA: 'Scarlet FC',
			teamB: 'Crimson United',
			a: { primary: '#c0392b', secondary: '#a93226' },
			b: { primary: '#b93a26', secondary: '#a5301f' },
			note: 'THE AWFUL PAIR — both pairs within a few degrees of hue. Nothing here can tell the sides apart, so the tile scale does.'
		},
		{
			id: 'primary:clash',
			name: 'Same Red, Different Trim',
			teamA: 'Vermilion',
			teamB: 'Cardinal',
			a: { primary: '#c0392b', secondary: '#125c62' },
			b: { primary: '#b93a26', secondary: '#c9a227' },
			note: 'Primaries collide but the trims plainly do not — so this is NOT a collision, and the tiles stay the same size.'
		},
		{
			id: 'light:light',
			name: 'The Pastel Derby',
			teamA: 'Butter Yellow',
			teamB: 'Bone White',
			a: { primary: '#fdf6d8', secondary: '#fff8e0' },
			b: { primary: '#fffbe6', secondary: '#fdf9dd' },
			note: 'LIGHT ON LIGHT, and each team picked two near-identical shades — so both halves are flagged flat as well.'
		},
		{
			id: 'dark:dark',
			name: 'Midnight on Midnight',
			teamA: 'Pitch Black',
			teamB: 'Deep Navy',
			a: { primary: '#0b0b10', secondary: '#2a2a3a' },
			b: { primary: '#0b1c38', secondary: '#1d3a63' },
			note: 'The same problem inverted — resolved against the active theme, not a fixed background.'
		},
		{
			id: 'grey:grey',
			name: 'The Slate Affair',
			teamA: 'Concrete',
			teamB: 'Gunmetal',
			a: { primary: '#8a8a8a', secondary: '#c4c4c4' },
			b: { primary: '#6f6f6f', secondary: '#3a3a3a' },
			note: 'No hue at all. Nothing is invented; the mirroring does all the work.'
		},
		{
			id: 'neon:neon',
			name: 'Retina Damage',
			teamA: 'Neon Lime',
			teamB: 'Hot Magenta',
			a: { primary: '#39ff14', secondary: '#ff00ff' },
			b: { primary: '#ff1493', secondary: '#00ffff' },
			note: 'Four colours far outside anything tasteful, and still 8% ink.'
		},
		{
			id: 'swapped',
			name: 'The Nursery Bowl',
			teamA: 'Baby Blue',
			teamB: 'Blush',
			a: { primary: '#a8d5e2', secondary: '#f6c6d0' },
			b: { primary: '#f6c6d0', secondary: '#a8d5e2' },
			note: 'The same two colours with the roles swapped. Checker and teeth trade places; the mirroring is what still separates the sides.'
		},
		{
			id: 'max:contrast',
			name: null,
			teamA: 'Pure Black',
			teamB: 'Pure White',
			a: { primary: '#000000', secondary: '#ffffff' },
			b: { primary: '#ffffff', secondary: '#000000' },
			note: 'The extremes, and an unnamed rivalry.'
		},
		{
			id: 'garbage:input',
			name: 'Whatever They Typed',
			teamA: 'No Colour',
			teamB: 'Also Broken',
			a: { primary: 'not a colour', secondary: '' },
			b: { primary: '#12345', secondary: 'rgb(1,2,3)' },
			note: 'Unparseable input from free-text fields. Falls back rather than throwing.'
		}
	];

	let theme = $state<'system' | 'light' | 'dark'>('dark');
	let height = $state(96);
	let grey = $state(false);

	$effect(() => {
		const root = document.documentElement;
		if (theme === 'system') root.removeAttribute('data-theme');
		else root.setAttribute('data-theme', theme);
		return () => root.removeAttribute('data-theme');
	});

	/** Which halves, if any, read as one tone because a team picked two of them. */
	function flatLabel(flat: { a: boolean; b: boolean }): string {
		const sides = [flat.a ? 'A' : '', flat.b ? 'B' : ''].filter(Boolean);
		if (!sides.length) return 'no';
		return sides.join(' + ') + ' read as one tone';
	}

	/* Recomputed here purely to print. The component does its own. */
	const readout = $derived(
		SAMPLES.map((s) => rivalryPattern(s.a, s.b, theme === 'light' ? 'light' : 'dark'))
	);
</script>

<svelte:head>
	<title>Rivalry header — dev</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<div class="page">
	<header class="intro">
		<p class="tag">DEV BENCH · NOT LINKED</p>
		<h1>Rivalry header patterns</h1>
		<p class="lede">
			Twelve matchups, including the pairs designed to break it. One motif, houndstooth, split
			50/50 with a gap of bare surface between them — no interlock, no dither, no fade — and the
			VS disc sits inside that gap. Each team picks two colours: the primary takes the checker,
			the secondary the teeth. Both halves anchor their tiling to the gap, so the pattern breaks
			on a whole tile on each side and reflects across the middle. Every header below is the
			theme's own surface with those four colours as ink at 8%; if any of them reads as a
			coloured header rather than a textured one, that is the bug.
		</p>

		<div class="controls">
			<fieldset>
				<legend>Theme</legend>
				{#each ['system', 'light', 'dark'] as t (t)}
					<label><input type="radio" bind:group={theme} value={t} /> {t}</label>
				{/each}
			</fieldset>

			<fieldset>
				<legend>Height</legend>
				{#each [48, 72, 96, 140, 200] as h (h)}
					<label><input type="radio" bind:group={height} value={h} /> {h}px</label>
				{/each}
			</fieldset>

			<fieldset>
				<legend>Check</legend>
				<label><input type="checkbox" bind:checked={grey} /> greyscale</label>
			</fieldset>
		</div>

		<p class="lede">
			Turn greyscale on: the two sides must still read as two sides. That is why the halves use
			<em>mirrored</em> houndstooth rather than only a different colour — hue alone would vanish
			here and for a colourblind reader.
		</p>
	</header>

	<h2 class="section-head">Twelve matchups</h2>

	<div class="grid" class:grey>
		{#each SAMPLES as s, i (s.id)}
			{@const d = readout[i].diagnostics}
			<section class="sample">
				<RivalryHeader
					colorA={s.a}
					colorB={s.b}
					name={s.name}
					teamA={s.teamA}
					teamB={s.teamB}
					{height}
				/>

				{#if s.note}<p class="note">{s.note}</p>{/if}

				<dl class="diag">
					<div><dt>tile</dt><dd>{d.tile.a}/{d.tile.b}px</dd></div>
					<div><dt>alpha</dt><dd>{Math.round(d.alpha * 100)}%</dd></div>
					<div>
						<dt>ink A</dt>
						<dd class="swatches">
							<span class="sw" style="--c:{d.ink.a.primary}"></span>
							<span class="sw" style="--c:{d.ink.a.secondary}"></span>
							<span class="mono">{d.ink.a.primary} {d.ink.a.secondary}</span>
						</dd>
					</div>
					<div>
						<dt>ink B</dt>
						<dd class="swatches">
							<span class="sw" style="--c:{d.ink.b.primary}"></span>
							<span class="sw" style="--c:{d.ink.b.secondary}"></span>
							<span class="mono">{d.ink.b.primary} {d.ink.b.secondary}</span>
						</dd>
					</div>
					<div>
						<dt>picked</dt>
						<dd class="swatches">
							<span class="sw" style="--c:{readout[i].badge.a.primary}"></span>
							<span class="sw" style="--c:{readout[i].badge.a.secondary}"></span>
							<span class="mono">·</span>
							<span class="sw" style="--c:{readout[i].badge.b.primary}"></span>
							<span class="sw" style="--c:{readout[i].badge.b.secondary}"></span>
						</dd>
					</div>
					<div>
						<dt>flat</dt>
						<dd class:flag={d.flat.a || d.flat.b}>{flatLabel(d.flat)}</dd>
					</div>
					<div>
						<dt>text</dt>
						<dd class:bad={d.textContrast < 7}>{d.textContrast.toFixed(2)}:1</dd>
					</div>
					<div>
						<dt>collision</dt>
						<dd class:flag={d.collision}>{d.collision ? 'yes — side B gets a coarser tile' : 'no'}</dd>
					</div>
				</dl>
			</section>
		{/each}
	</div>
</div>

<style>
	.page {
		max-inline-size: 1180px;
		margin-inline: auto;
		padding: var(--s-6) var(--s-4) var(--s-8);
		color: var(--ink);
	}

	.tag {
		margin: 0 0 var(--s-2);
		font-family: var(--font-mono);
		font-size: 11px;
		letter-spacing: 0.14em;
		color: var(--warn);
	}

	h1 {
		margin: 0 0 var(--s-2);
		font-family: var(--font-display);
		text-transform: uppercase;
		font-size: var(--t-xl);
	}

	.lede {
		max-inline-size: 72ch;
		margin: 0 0 var(--s-4);
		font-size: var(--t-sm);
		line-height: 1.55;
		color: var(--ink-soft);
	}

	.controls {
		display: flex;
		flex-wrap: wrap;
		gap: var(--s-3);
		margin-bottom: var(--s-4);
	}

	fieldset {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: var(--s-2);
		margin: 0;
		padding: var(--s-2) var(--s-3);
		border: 1.5px solid var(--border);
		border-radius: var(--r-md);
	}

	legend {
		padding-inline: 6px;
		font-family: var(--font-mono);
		font-size: 10px;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--ink-faint);
	}

	label {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		font-size: var(--t-xs);
		white-space: nowrap;
	}

	h2,
	.section-head {
		margin: 0 0 var(--s-2);
		font-family: var(--font-display);
		text-transform: uppercase;
		font-size: var(--t-lg, 20px);
	}

	.section-head {
		margin-top: var(--s-6);
	}

	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
		gap: var(--s-4);
	}

	/* The whole point of the check: if the split disappears here, the mirroring
	   is not doing its job. */
	.grey {
		filter: grayscale(1);
	}

	.sample {
		border: 1.5px solid var(--border);
		border-radius: var(--r-md);
		padding: var(--s-3);
		background: var(--surface-2);
		min-inline-size: 0;
	}

	.note {
		margin: var(--s-3) 0 0;
		font-size: var(--t-xs);
		line-height: 1.5;
		color: var(--ink-soft);
	}

	.diag {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
		gap: var(--s-1) var(--s-3);
		margin: var(--s-3) 0 0;
		padding-top: var(--s-3);
		border-top: 1px solid var(--border);
		font-size: 11px;
	}

	.diag div {
		display: flex;
		gap: 6px;
		min-inline-size: 0;
	}

	dt {
		flex: 0 0 auto;
		font-family: var(--font-mono);
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--ink-faint);
	}

	dd {
		margin: 0;
		min-inline-size: 0;
		font-weight: 700;
		overflow-wrap: anywhere;
	}

	.mono {
		font-family: var(--font-mono);
		font-weight: 400;
		color: var(--ink-soft);
	}

	.swatches {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		flex-wrap: wrap;
	}

	.sw {
		inline-size: 12px;
		block-size: 12px;
		border-radius: 3px;
		background: var(--c);
		box-shadow: inset 0 0 0 1px rgb(0 0 0 / 25%);
	}

	.flag {
		color: var(--warn);
	}

	.bad {
		color: var(--danger);
	}
</style>
