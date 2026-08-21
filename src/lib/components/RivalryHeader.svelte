<script lang="ts">
	/* ═══════════════════════════════════════════════════════════════════════
	   RIVALRY HEADER
	   ═══════════════════════════════════════════════════════════════════════
	   The name, the two teams and the VS, sitting on a texture built from the
	   colours those two teams picked. The surface underneath is the theme's own
	   `--surface`; the colours are ink on it and never a fill.

	   ── Two boxes with a gap ─────────────────────────────────────────────────
	   Each half is a plain box carrying a repeating tile, stopping half a gap
	   short of the middle. That is why there is no mask and no gradient anywhere
	   in this file: the sides are separated by bare surface, not by anything
	   drawn.

	   The gap is a touch wider than the VS disc, so the disc sits INSIDE the
	   channel with clearance rather than overhanging the texture on both sides —
	   which is what makes the split read as deliberate.

	   ── Where the pattern breaks ─────────────────────────────────────────────
	   Both halves anchor their tiling to the GAP, not to the outside of the
	   header: half A to its right edge, half B to its left. Anchor both to their
	   own start instead and one side happens to break on a whole tile at the gap
	   while the other is sliced through the middle of a motif, which reads as a
	   mistake even when nobody can say why.

	   Because side b's tile is the mirror of side a's, anchoring both to the gap
	   also makes the pattern REFLECT across it. Rows already lined up — both
	   start at the top — so the two halves now meet as one fabric cut apart
	   rather than two unrelated ones.

	   The anchors are physical (`left`/`right`) rather than logical, and so are
	   the halves, because `background-position` has no logical form: mixing the
	   two would silently anchor to the outside edges under RTL.

	   ── The VS clashes ───────────────────────────────────────────────────────
	   The disc sits in the gap, so the two halves of the word slide over bare
	   surface rather than over either team's texture. `heat` paces it; at zero
	   it does not move at all.

	   ── Both themes, server-side ─────────────────────────────────────────────
	   Nothing on this site sets `data-theme`, so the theme is whatever the
	   reader's OS says — which the Worker cannot know while it renders. Picking
	   one and correcting it in JS would mean a flash of the wrong texture on
	   half the visits, and nothing at all for a reader without JS.

	   So both are generated and handed to CSS as custom properties, and a media
	   query chooses.
	   ═══════════════════════════════════════════════════════════════════════ */

	import { rivalryPattern, type TeamColors } from '$lib/rivalryPattern';

	type Props = {
		/** Each team's two survey picks. Primary is the checker, secondary the teeth. */
		colorA: TeamColors;
		colorB: TeamColors;
		/** Null until the two of them have agreed one. */
		name?: string | null;
		teamA: string;
		teamB: string;
		/** 48–200. Below 72 the header drops to its compact arrangement. */
		height?: number;
		/** Chips in the teams' real colours, which the texture never shows. */
		badges?: boolean;
		/**
		 * How settled the rivalry is, 0–3. Drives the VS clash: nothing agreed
		 * sits perfectly still, everything agreed hits hardest and most often.
		 */
		heat?: number;
		/** Said out loud for anyone not watching the clash. Omit to say nothing. */
		heatLabel?: string;
		/** Shifts this card's clash out of phase with its neighbours'. */
		stagger?: number;
		/** What to call a rivalry the two of them have not named yet. */
		unnamedLabel?: string;
	};

	let {
		colorA,
		colorB,
		name = null,
		teamA,
		teamB,
		height = 96,
		badges = true,
		heat = 0,
		heatLabel = '',
		stagger = 0,
		unnamedLabel = 'Still unnamed'
	}: Props = $props();

	const light = $derived(rivalryPattern(colorA, colorB, 'light'));
	const dark = $derived(rivalryPattern(colorA, colorB, 'dark'));

	const compact = $derived(height < 72);
</script>

<div
	class="rh"
	class:rh--compact={compact}
	class:lit={heat > 0}
	style="--rh-h:{height}px; --heat:{heat}; --stagger:{stagger}"
	data-collision={light.diagnostics.collision || dark.diagnostics.collision ? 'true' : 'false'}
>
	{#if heatLabel}
		<!-- Heat is carried by the clash rather than by anything countable, so it
		     has to be said out loud for anyone who is not watching it move. -->
		<span class="sr-only">{heatLabel}</span>
	{/if}
	<!-- Decoration, and only decoration. Everything a reader needs is in the
	     content below, so this is hidden rather than described. -->
	<div class="rh__ink" aria-hidden="true">
		<span
			class="rh__half rh__half--a"
			style="--i-l:{light.a.image}; --i-d:{dark.a.image}; --s-l:{light.a.size}; --s-d:{dark.a.size}"
		></span>
		<span
			class="rh__half rh__half--b"
			style="--i-l:{light.b.image}; --i-d:{dark.b.image}; --s-l:{light.b.size}; --s-d:{dark.b.size}"
		></span>
	</div>

	<div class="rh__content">
		<h3 class="rh__name" class:rh__name--unset={!name}>{name ?? unnamedLabel}</h3>

		<p class="rh__teams">
			<span class="rh__team">
				{#if badges}
					<!-- Both real picks, in the order they were made. The texture had to
					     give these up; the chips are where they survive. -->
					<span class="rh__chips">
						<span class="rh__badge" style="--c:{light.badge.a.primary}"></span>
						<span class="rh__badge" style="--c:{light.badge.a.secondary}"></span>
					</span>
				{/if}
				{teamA}
			</span>
			<!-- Two clipped copies of the same word. Together they are "VS"; apart
			     they are "VS" broken along a diagonal. See "The clash" below. -->
			<span class="rh__vs" aria-hidden="true">
				<span class="rh__vs-half rh__vs-half--a">VS</span>
				<span class="rh__vs-half rh__vs-half--b">VS</span>
			</span>
			<span class="rh__team">
				{#if badges}
					<span class="rh__chips">
						<span class="rh__badge" style="--c:{light.badge.b.primary}"></span>
						<span class="rh__badge" style="--c:{light.badge.b.secondary}"></span>
					</span>
				{/if}
				{teamB}
			</span>
		</p>
	</div>
</div>

<style>
	.rh {
		position: relative;
		overflow: hidden;
		isolation: isolate;
		display: grid;
		place-items: center;
		min-block-size: var(--rh-h);
		padding: var(--s-4) var(--s-4) var(--s-3);
		/* The board's card already clips its own corners, so it sets this to 0
		   rather than rounding a rounded thing. */
		border-radius: var(--rh-radius, var(--r-md));
		/* The base surface is the theme's, untouched. This is the whole premise:
		   a textured header, not a coloured one. */
		background: var(--surface);
		color: var(--ink);
		/* Wider than the 24px VS disc, so the disc clears the texture either
		   side of it. The compact header shrinks the disc, so it shrinks too. */
		--rh-gap: 32px;
	}

	.rh--compact {
		padding: var(--s-2) var(--s-3);
		--rh-gap: 26px;
	}

	/* ── The texture ─────────────────────────────────────────────────────────
	   Two halves, each repeating its tile at a size fixed in PIXELS — never a
	   percentage — so the motif holds its scale at any header width. Each stops
	   half a gap short of the centre, which leaves the gap centred on 50%
	   whatever the header is doing. */
	.rh__ink {
		position: absolute;
		inset: 0;
		z-index: 0;
		pointer-events: none;
	}

	.rh__half {
		position: absolute;
		inset-block: 0;
		inline-size: calc(50% - var(--rh-gap) / 2);
		background-image: var(--i-l);
		background-size: var(--s-l);
		background-repeat: repeat;
	}

	/* Anchored to the gap, not to the outside of the header, so both sides break
	   on a whole tile in the middle. See the note at the top of this file. */
	.rh__half--a {
		left: 0;
		background-position: right 0 top 0;
	}

	.rh__half--b {
		right: 0;
		background-position: left 0 top 0;
	}

	/* Only the ink changes with the theme. Same selectors app.css uses, so a
	   reader who has expressed no preference follows their OS and one who has
	   overrides it. */
	@media (prefers-color-scheme: dark) {
		:global(:root:not([data-theme='light'])) .rh__half {
			background-image: var(--i-d);
			background-size: var(--s-d);
		}
	}

	:global(:root[data-theme='dark']) .rh__half {
		background-image: var(--i-d);
		background-size: var(--s-d);
	}

	/* ── The content ─────────────────────────────────────────────────────────── */

	.rh__content {
		position: relative;
		z-index: 1;
		/* Full width, not shrink-to-fit: the teams row splits the remaining space
		   into two equal halves either side of the VS, and that only holds if the
		   row knows how much space there is. */
		inline-size: 100%;
		text-align: center;
	}

	.rh__name {
		margin: 0 0 var(--s-2);
		font-family: var(--font-display);
		text-transform: uppercase;
		letter-spacing: 0.01em;
		line-height: 1.08;
		font-size: clamp(17px, 4.4vw, 23px);
		max-inline-size: 22ch;
		margin-inline: auto;
		text-wrap: balance;
		overflow-wrap: anywhere;
		color: var(--ink);
	}

	.rh--compact .rh__name {
		font-size: clamp(14px, 3.4vw, 17px);
		margin-bottom: var(--s-1);
	}

	.rh__name--unset {
		opacity: 0.65;
		font-size: clamp(14px, 3.4vw, 17px);
	}

	/* Three columns rather than a centred flex line, so the VS disc sits at
	   exactly 50% of the header whatever the two team names weigh. A flex row
	   centres the LINE, which puts the disc off-centre the moment one name is
	   longer than the other — and the split is pinned to 50%, so the disc would
	   drift off the edge it is supposed to mark. */
	.rh__teams {
		display: grid;
		grid-template-columns: 1fr auto 1fr;
		align-items: center;
		gap: var(--s-3);
		margin: 0;
	}

	.rh__team {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		min-inline-size: 0;
		font-family: var(--font-mono);
		font-size: var(--t-xs);
		font-weight: 700;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--ink-soft);
		overflow-wrap: anywhere;
	}

	.rh__team:first-child {
		justify-self: end;
		text-align: right;
	}

	.rh__team:last-child {
		justify-self: start;
		text-align: left;
	}

	/* The team's REAL colour, the one the texture had to give up. A ring rather
	   than a bare swatch, because a pale pick on the light theme would otherwise
	   be an invisible chip. */
	.rh__chips {
		flex: 0 0 auto;
		display: inline-flex;
		gap: 3px;
	}

	.rh__badge {
		flex: 0 0 auto;
		inline-size: 10px;
		block-size: 10px;
		border-radius: 3px;
		background: var(--c);
		box-shadow: inset 0 0 0 1px rgb(0 0 0 / 22%);
	}

	.rh__vs {
		position: relative;
		flex: 0 0 auto;
		inline-size: 24px;
		block-size: 24px;
		border-radius: 50%;
		border: 1.5px solid var(--border-strong);
		font-family: var(--font-display);
		font-size: 9px;
		color: var(--ink-soft);
		/* How far the halves draw apart before they hit. Heat is the punch. */
		--throw: calc(0.5px + var(--heat, 0) * 0.85px);
	}

	.rh--compact .rh__vs {
		inline-size: 20px;
		block-size: 20px;
		font-size: 8px;
	}

	/* Each half is a full copy of the word clipped to one side of a diagonal
	   seam. The triangles are drawn oversize (-20%/120%) so their hypotenuses
	   lie on exactly the same line through the centre and the two clips tile the
	   glyph with no hairline gap between them. */
	.rh__vs-half {
		position: absolute;
		inset: 0;
		display: grid;
		place-items: center;
		line-height: 1;
	}

	.rh__vs-half--a {
		clip-path: polygon(-20% -20%, 120% -20%, -20% 120%);
	}

	.rh__vs-half--b {
		clip-path: polygon(120% -20%, 120% 120%, -20% 120%);
	}

	/* The shockwave and the spark along the seam. Absolute, so neither becomes a
	   flex item of the disc. */
	.rh__vs::before,
	.rh__vs::after {
		content: '';
		position: absolute;
		pointer-events: none;
		opacity: 0;
	}

	.rh__vs::before {
		inset: -1px;
		border-radius: 50%;
		border: 1.5px solid currentColor;
	}

	/* `--ink` rather than currentColor: the spark is the impact frame and has to
	   be the brightest thing in the composition, where the disc itself is muted. */
	.rh__vs::after {
		top: 50%;
		left: -16%;
		inline-size: 132%;
		block-size: 1.5px;
		margin-top: -0.75px;
		border-radius: 2px;
		background: linear-gradient(90deg, transparent, var(--ink) 26%, var(--ink) 74%, transparent);
		transform: rotate(-45deg) scaleX(0.15);
	}

	/* ── The clash ───────────────────────────────────────────────────────────
	   A versus screen has one move and fighting games have spent thirty years
	   sharpening it: the two sides draw apart, slam together, and the frame of
	   contact is HELD. That freeze is the whole trick — without it the halves
	   just bounce, and it reads as a wobble instead of a collision.

	   On the hit there is a spark down the seam and a shockwave off the disc.
	   Every piece runs on the same duration and the same negative delay, so all
	   four land on the same frame. Heat sets both: a fully settled rivalry hits
	   harder and more often; a pair who have agreed nothing sit perfectly still,
	   which is its own kind of message.

	   The delay is per-card and negative, so a wall of rivalries does not
	   detonate in unison like a strobe — and none of them makes you wait for the
	   first hit, because they all start mid-cycle. */
	.lit {
		--cycle: calc(4.2s - var(--heat) * 0.6s);
		--phase: calc(var(--stagger, 0) * -0.41s);
	}

	.lit .rh__vs-half--a {
		animation: clash-a var(--cycle) linear var(--phase) infinite;
	}

	.lit .rh__vs-half--b {
		animation: clash-b var(--cycle) linear var(--phase) infinite;
	}

	.lit .rh__vs {
		animation: kick var(--cycle) linear var(--phase) infinite;
	}

	.lit .rh__vs::before {
		animation: shock var(--cycle) linear var(--phase) infinite;
	}

	.lit .rh__vs::after {
		animation: spark var(--cycle) linear var(--phase) infinite;
	}

	/* The easing lives on the keyframes rather than on the animation, because a
	   hit is two different motions: the draw-back DECELERATES into its held pose
	   and the strike ACCELERATES out of it. One curve across both is the wobble
	   this is trying not to be. */
	@keyframes clash-a {
		0%,
		34% {
			transform: translate(0, 0);
			animation-timing-function: cubic-bezier(0.16, 0.8, 0.3, 1);
		}
		44% {
			transform: translate(calc(var(--throw) * -1), calc(var(--throw) * -1));
			animation-timing-function: cubic-bezier(0.85, 0, 1, 0.5);
		}
		/* Contact, and then four percent of nothing at all. */
		47%,
		51% {
			transform: translate(0, 0);
			animation-timing-function: cubic-bezier(0.2, 0.9, 0.3, 1);
		}
		57% {
			transform: translate(calc(var(--throw) * -0.3), calc(var(--throw) * -0.3));
		}
		68%,
		100% {
			transform: translate(0, 0);
		}
	}

	@keyframes clash-b {
		0%,
		34% {
			transform: translate(0, 0);
			animation-timing-function: cubic-bezier(0.16, 0.8, 0.3, 1);
		}
		44% {
			transform: translate(var(--throw), var(--throw));
			animation-timing-function: cubic-bezier(0.85, 0, 1, 0.5);
		}
		47%,
		51% {
			transform: translate(0, 0);
			animation-timing-function: cubic-bezier(0.2, 0.9, 0.3, 1);
		}
		57% {
			transform: translate(calc(var(--throw) * 0.3), calc(var(--throw) * 0.3));
		}
		68%,
		100% {
			transform: translate(0, 0);
		}
	}

	/* The disc takes the hit too — a punch out and a shallow squash back. The
	   ring that used to ride along with it is gone: `shock` below already draws
	   one, in a colour that survives both themes. */
	@keyframes kick {
		0%,
		44% {
			transform: scale(1);
		}
		47% {
			transform: scale(calc(1 + var(--heat) * 0.05));
			animation-timing-function: cubic-bezier(0.2, 0.9, 0.3, 1);
		}
		56% {
			transform: scale(calc(1 - var(--heat) * 0.012));
		}
		72%,
		100% {
			transform: scale(1);
		}
	}

	/* Off the disc on contact and gone before you can look at it. */
	@keyframes shock {
		0%,
		46% {
			transform: scale(0.92);
			opacity: 0;
		}
		48% {
			transform: scale(1);
			opacity: calc(0.25 + var(--heat) * 0.2);
		}
		74%,
		100% {
			transform: scale(1.9);
			opacity: 0;
		}
	}

	/* The impact frame: one line down the seam the halves just closed. */
	@keyframes spark {
		0%,
		46% {
			transform: rotate(-45deg) scaleX(0.15);
			opacity: 0;
		}
		47.5% {
			transform: rotate(-45deg) scaleX(1);
			opacity: 1;
		}
		54%,
		100% {
			transform: rotate(-45deg) scaleX(1.2);
			opacity: 0;
		}
	}

	/* Rule 3 from motion.ts: all of this is decoration, so it stops entirely
	   rather than merely slowing down. The halves settle closed, and a VS that
	   never moves is still a VS. */
	@media (prefers-reduced-motion: reduce) {
		.lit .rh__vs,
		.lit .rh__vs::before,
		.lit .rh__vs::after,
		.lit .rh__vs-half {
			animation: none;
		}
	}
</style>
