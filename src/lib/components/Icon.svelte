<script lang="ts">
	/* ═══════════════════════════════════════════════════════════════════════
	   THE ICON SET
	   ═══════════════════════════════════════════════════════════════════════
	   Sixteen marks drawn on a 24-unit grid, in the league's own vocabulary:
	   helmets, goalposts, penalty flags, chain-gang down markers. They replace
	   the emoji the site used to lean on (🔒 🔥 📍 ✈️ 🏆), which rendered as a
	   different picture on every platform and could not take a colour.

	   Everything is stroked in `currentColor` rather than filled, so an icon
	   inherits whatever it sits inside — gold on a navy nav, chalk on turf,
	   ink on a card — with no per-context variants.

	   Written as a branch per icon rather than a map of path strings, because
	   `{@html}` would put this file's markup outside the compiler's reach for
	   no benefit: none of it is dynamic.
	   ═══════════════════════════════════════════════════════════════════════ */

	import type { IconName } from '$lib/icons';

	let {
		name,
		size = 20,
		/* Supply a title only when the icon is the sole carrier of meaning.
		   Beside a text label it is decoration and must stay out of the
		   accessibility tree, or every label gets read twice. */
		title = '',
		class: klass = ''
	}: {
		name: IconName;
		size?: number;
		title?: string;
		class?: string;
	} = $props();
</script>

<svg
	class="icon {klass}"
	width={size}
	height={size}
	viewBox="0 0 24 24"
	fill="none"
	stroke="currentColor"
	stroke-width="1.75"
	stroke-linecap="round"
	stroke-linejoin="round"
	role={title ? 'img' : 'presentation'}
	aria-hidden={title ? undefined : 'true'}
	aria-label={title || undefined}
>
	{#if title}<title>{title}</title>{/if}

	{#if name === 'football'}
		<ellipse cx="12" cy="12" rx="10.4" ry="6.2" transform="rotate(-25 12 12)" />
		<path d="M7.6 16.4 16.4 7.6" />
		<path d="M9.5 13.1l1.7 1.7M11.2 11.4l1.7 1.7M12.9 9.7l1.7 1.7" />
	{:else if name === 'helmet'}
		<!--
			The one icon in the set that is filled rather than stroked, and it has
			to be. A helmet needs a shell, a brow, an ear hole and a two-slot cage
			— six elements — and at stroke 1.75 on a 24 grid each one eats 7% of
			the width. Five stroked drafts all collapsed into a bag or a keyhole.
			Filling the shell hands the silhouette the job of carrying the shape,
			which leaves the stroke budget for the only gaps that must survive at
			20px: the two inside the facemask.

			Shell and ear hole are one path under evenodd, so the hole is a hole
			in any colour rather than a dot painted in an assumed background.
		-->
		<path
			fill="currentColor"
			stroke="none"
			fill-rule="evenodd"
			d="M17.6 10.9V10c-.1-3.6-3.1-5.9-6.8-5.9C7.1 4.1 3.6 6.8 3.6 11.1v4.2Q3.6 18.5 6.8 18.5h6.7v-7.6Z
			   M9.85 11.6a1.35 1.35 0 1 1-2.7 0 1.35 1.35 0 1 1 2.7 0Z"
		/>
		<path d="M17.6 10.9c2.8.5 4 2.5 3.8 4.6-.2 1.8-1.4 2.8-3.2 3H13.5" />
		<path d="M13.5 14.9h8" />
	{:else if name === 'goalpost'}
		<path d="M12 21v-9" />
		<path d="M5 12h14" />
		<path d="M6.4 12V3.5M17.6 12V3.5" />
		<path d="M8 21h8" />
	{:else if name === 'flag'}
		<path d="M6 21V3.5" />
		<path d="M6 4.5h11.5l-2.6 3.6 2.6 3.6H6z" fill="currentColor" stroke="none" />
		<path d="M6 4.5h11.5l-2.6 3.6 2.6 3.6H6z" />
	{:else if name === 'whistle'}
		<path d="M13.9 10.6H20a2 2 0 1 1 0 4h-1.5" />
		<circle cx="9" cy="14" r="5.6" />
		<circle cx="9" cy="14" r="1.5" />
		<path d="M12 8.6 13.5 5" />
	{:else if name === 'trophy'}
		<path d="M7.5 3.5h9V9a4.5 4.5 0 0 1-9 0z" />
		<path d="M7.5 5H5v1.4a3 3 0 0 0 3 3" />
		<path d="M16.5 5H19v1.4a3 3 0 0 1-3 3" />
		<path d="M12 13.5v3" />
		<path d="M9 20.5h6l-.8-4h-4.4z" />
	{:else if name === 'marker'}
		<rect x="6" y="2.5" width="12" height="7.5" rx="1.2" />
		<path d="M12 10v11" />
		<path d="M8.5 21h7" />
		<path d="M9.6 6.2h4.8" />
	{:else if name === 'clipboard'}
		<rect x="4.5" y="4" width="15" height="17" rx="2" />
		<rect x="9" y="2" width="6" height="3.6" rx="1.2" />
		<path d="M8.5 11h7M8.5 15h4.5" />
	{:else if name === 'scoreboard'}
		<rect x="2.5" y="3.5" width="19" height="11.5" rx="2" />
		<path d="M12 3.5v11.5" />
		<path d="M6 8h3M6 11h3M15 8h3M15 11h3" />
		<path d="M8 15v5.5M16 15v5.5" />
	{:else if name === 'home'}
		<path d="M3.5 11 12 3.5l8.5 7.5" />
		<path d="M6 10v10.5h12V10" />
		<path d="M10 20.5V15h4v5.5" />
	{:else if name === 'away'}
		<path d="M21.5 2.5 2.5 11l7.4 2.7L12.6 21z" />
		<path d="M21.5 2.5 9.9 13.7" />
	{:else if name === 'flame'}
		<path
			d="M12 21.5c3.9 0 6.8-2.7 6.8-6.3 0-4.4-4.4-5.9-4.9-10.3-1.9 1.5-2.9 3.4-2.9 5.4-1-.8-1.5-2-1.5-3C7.4 8.8 5.2 11.5 5.2 15.2c0 3.6 2.9 6.3 6.8 6.3z"
		/>
	{:else if name === 'lock'}
		<rect x="4.5" y="10.5" width="15" height="10" rx="2.2" />
		<path d="M8 10.5V7a4 4 0 0 1 8 0v3.5" />
		<circle cx="12" cy="15.5" r="1.4" />
	{:else if name === 'stopwatch'}
		<circle cx="12" cy="14" r="7.5" />
		<path d="M12 14V9.8" />
		<path d="M9.5 2.5h5M12 2.5v2.9" />
		<path d="M19.2 8.2 20.7 6.7" />
	{:else if name === 'signal'}
		<circle cx="12" cy="4.2" r="2.4" />
		<path d="M12 8v7" />
		<path d="M12 9 7.6 3.2M12 9l4.4-5.8" />
		<path d="M12 15l-3 6M12 15l3 6" />
	{:else if name === 'chevron'}
		<path d="M9 4.5 16.5 12 9 19.5" />
	{/if}
</svg>

<style>
	.icon {
		display: inline-block;
		flex: 0 0 auto;
		vertical-align: -0.18em;
	}
</style>
