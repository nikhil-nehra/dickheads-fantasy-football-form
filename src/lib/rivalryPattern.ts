/* ═══════════════════════════════════════════════════════════════════════════
   RIVALRY PATTERN
   ═══════════════════════════════════════════════════════════════════════════
   A rivalry header is the neutral page surface with a TEXTURE on it. It is not
   a coloured header. Each team picks TWO colours in a survey — a primary and a
   secondary — and those become ink at 8% alpha and nothing more, with the
   surface underneath staying the theme's own.

   One motif — houndstooth — and two halves that do not touch. Team A owns the
   left, team B the right, and between them is a gap of bare surface. No
   interlock, no dither, no fade — the two sides simply stop.

   ── Two colours, one weave ───────────────────────────────────────────────────
   The primary takes the checker and the secondary takes the teeth. That split
   is not arbitrary: a real houndstooth IS a two-tone weave, and those are its
   two parts. The checker is twice the area of the teeth, so the primary reads
   as the side's colour and the secondary as its trim, which is the way round
   people mean those words.

   The two never overlap, so a pixel still carries at most one ink and the alpha
   budget is exactly what it was with one colour per side.

   ── The gap is where the VS is ───────────────────────────────────────────────
   The gap is centred on 50%, which is also where `RivalryHeader` pins the VS
   disc, so the disc sits inside the channel rather than straddling texture on
   both sides. That is why the split is vertical rather than tilted: a tilted
   gap would hold the disc at exactly one height and drift off it everywhere
   else.

   ── Two halves, not one image ────────────────────────────────────────────────
   The obvious shape is one SVG per header. It does not work. Two things have to
   scale differently: the MOTIF must hold its true pixel size at every header
   width, and the GAP must stay centred on whatever that width is. A single
   background image can do one or the other — stretch it and the motif distorts,
   pin it and the gap lands in the wrong place.

   So each side is a tiling image at a fixed `background-size` in px, and the
   header places them in two boxes that stop short of the middle. The edges are
   box edges: no mask, no gradient, no antialiased ramp to tune. The header also
   anchors each half's tiling TO the gap, so both sides break on a whole tile
   there rather than one of them being sliced mid-motif.

   ── Not hue alone ────────────────────────────────────────────────────────────
   The two sides use mirrored houndstooth, so the teeth point opposite ways.
   Print the header in greyscale and the two territories are still two
   territories.
   ═══════════════════════════════════════════════════════════════════════════ */

import {
	composite,
	contrast,
	fromLCh,
	hueDistance,
	parseHex,
	toHex,
	toLCh,
	type LCh,
	type RGB
} from './color';

export type Theme = 'light' | 'dark';
export type Side = 'a' | 'b';

/** What one team picked. Both come from the survey; neither is derived. */
export type TeamColors = {
	/** The checker, and two thirds of the ink. This is "their colour". */
	primary: string;
	/** The teeth. Trim, not a second main colour. */
	secondary: string;
};

/* ── What the pattern is painted onto ────────────────────────────────────── */

/**
 * The surface and text colours the pattern is composited against.
 *
 * These MIRROR `--surface` and `--ink` in app.css. They are duplicated rather
 * than read from CSS because the contrast proof runs in Node, in a unit test,
 * with no stylesheet in sight — and a proof against a guess is not a proof. The
 * test asserts they still match the stylesheet.
 */
export const SURFACE: Record<Theme, string> = { light: '#ffffff', dark: '#17241c' };
export const TEXT_INK: Record<Theme, string> = { light: '#191913', dark: '#eee9dc' };

/** AAA. Header text is large and short; there is no reason to spend it. */
export const MIN_TEXT_CONTRAST = 7;

/** The band the brief allows. Anything outside reads as a coloured header. */
export const ALPHA_RANGE = { min: 0.08, max: 0.14 } as const;

/** Tile edge in px. */
export const TILE = 28;

/**
 * Ink alpha where the motif paints.
 *
 * The floor of the band, because houndstooth covers three quarters of its tile
 * where an open motif like a hatch covers a quarter. At equal alpha it would
 * carry three times the ink and start reading as a fill rather than a texture.
 */
export const ALPHA = 0.08;

/* ── The motif ───────────────────────────────────────────────────────────── */

/**
 * Houndstooth in a `tile`×`tile` box, for one side, in two colours.
 *
 * A checker in the primary plus two teeth in the secondary. Not a couture
 * houndstooth, but at 28px and 8% it reads as one, and every shape stays inside
 * the box so it tiles.
 *
 * Side b is the mirror image, which points the teeth the other way. That is the
 * difference the two halves are told apart by when colour cannot do it — in
 * greyscale, for a colourblind reader, or when the two teams have picked
 * near-identical colours. It is also what makes the pattern reflect across the
 * gap once the header anchors both halves to it.
 */
function motif(t: number, side: Side, primary: string, secondary: string): string {
	const u = t / 2;
	const checker = `M0 0h${u}v${u}h${-u}zM${u} ${u}h${u}v${u}h${-u}z`;
	const teeth = `M${u} 0l${u} ${u}v${-u}zM0 ${u}l${u} ${u}h${-u}z`;
	const g = side === 'b' ? ` transform="translate(${t} 0) scale(-1 1)"` : '';

	return (
		`<g${g}>` +
		`<path d="${checker}" fill="${primary}" fill-opacity="${ALPHA}"/>` +
		`<path d="${teeth}" fill="${secondary}" fill-opacity="${ALPHA}"/>` +
		`</g>`
	);
}

/* ── Ink ─────────────────────────────────────────────────────────────────── */

/**
 * A team's colour turned into ink that survives an 8% wash on THIS theme.
 *
 * Hue is the thing a team actually chose, so hue is the thing that is kept.
 * Lightness is clamped into the band that still reads against the surface —
 * a pastel would vanish on white and a navy would vanish on the dark field —
 * and chroma is nudged up because the dilution takes most of it away, then
 * gamut-mapped, which hands the nudge back on colours that never had the
 * headroom.
 *
 * A colour with no chroma to begin with stays grey. Inventing a hue for
 * somebody who picked slate would be putting words in their mouth.
 */
export function resolveInk(color: RGB, theme: Theme): RGB {
	const { L, C, h } = toLCh(color);
	const target = theme === 'light' ? Math.min(L, 38) : Math.max(L, 84);
	const chroma = C < 3 ? 0 : Math.min(C * 1.2 + 8, 128);
	return fromLCh({ L: target, C: chroma, h });
}

/**
 * Would these two colours be indistinguishable once they are ink?
 *
 * Measured on the RESOLVED inks, not on what the teams typed. Resolution
 * clamps every lightness into the same narrow band, so a pair that looked
 * different in the picker — a bright red and a maroon — can arrive as the same
 * ink. Checking the originals would miss exactly the case this exists for.
 */
export function inksCollide(a: LCh, b: LCh): boolean {
	const greyA = a.C < 8;
	const greyB = b.C < 8;
	// Two greys have no hue to tell apart; one grey and one colour plainly do.
	if (greyA && greyB) return true;
	if (greyA !== greyB) return false;
	return hueDistance(a.h, b.h) < 25 && Math.abs(a.L - b.L) < 12;
}

/* ── The composition ─────────────────────────────────────────────────────── */

const uri = (svg: string) => `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;

/** One side's motif, as a tile that repeats on its own. */
function tileFor(tile: number, side: Side, primary: string, secondary: string): string {
	return uri(
		`<svg xmlns="http://www.w3.org/2000/svg" width="${tile}" height="${tile}"` +
			` viewBox="0 0 ${tile} ${tile}">${motif(tile, side, primary, secondary)}</svg>`
	);
}

export type PatternHalf = {
	/** A `background-image` value, ready to use. */
	image: string;
	/** A `background-size` value, in px, so the motif never scales with the box. */
	size: string;
};

export type ResolvedInk = { primary: string; secondary: string };

export type RivalryPattern = {
	theme: Theme;
	/** The left half and the right half. There is nothing in between them. */
	a: PatternHalf;
	b: PatternHalf;
	/** The teams' real colours, untouched. Badges get these; the texture does not. */
	badge: { a: TeamColors; b: TeamColors };
	diagnostics: {
		/** The four inks actually used, after lightness clamping and gamut mapping. */
		ink: { a: ResolvedInk; b: ResolvedInk };
		/** True when the two SIDES needed help beyond colour to tell apart. */
		collision: boolean;
		/**
		 * True when a team's own two picks are too close to tell apart, so their
		 * half reads as one tone rather than a weave.
		 *
		 * Reported, never corrected: they chose both colours, and quietly pulling
		 * one of them apart would be inventing a pick they did not make.
		 */
		flat: { a: boolean; b: boolean };
		tile: { a: number; b: number };
		alpha: number;
		/** The worst text contrast anywhere on the finished header. */
		textContrast: number;
	};
};

/** A fallback for a colour the parser could not read at all. */
const FALLBACK = '#7a7a72';

/**
 * Build the header pattern for one rivalry.
 *
 * There is no `seed`. One motif, a fixed gap and a hard edge left nothing for
 * it to decide — every visual property here follows from the four colours and
 * the theme.
 */
export function rivalryPattern(a: TeamColors, b: TeamColors, theme: Theme): RivalryPattern {
	const base = parseHex(SURFACE[theme])!;
	const text = parseHex(TEXT_INK[theme])!;

	const read = (hex: string) => parseHex(hex) ?? parseHex(FALLBACK)!;
	const raw = {
		a: { primary: read(a.primary), secondary: read(a.secondary) },
		b: { primary: read(b.primary), secondary: read(b.secondary) }
	};

	const ink = {
		a: {
			primary: resolveInk(raw.a.primary, theme),
			secondary: resolveInk(raw.a.secondary, theme)
		},
		b: {
			primary: resolveInk(raw.b.primary, theme),
			secondary: resolveInk(raw.b.secondary, theme)
		}
	};

	const lch = (c: RGB) => toLCh(c);

	/* The sides need help only when BOTH pairs are too close. If either the
	   primaries or the secondaries plainly differ, you can already tell which
	   half is whose, and growing one side's tile would be over-correcting. */
	const collision =
		inksCollide(lch(ink.a.primary), lch(ink.b.primary)) &&
		inksCollide(lch(ink.a.secondary), lch(ink.b.secondary));

	// When the colours cannot carry the split, SCALE does: side b's tile grows
	// by half, so the two halves read as different fabrics even in one colour.
	const tileA = TILE;
	const tileB = collision ? TILE * 1.5 : TILE;

	const hex = (side: 'a' | 'b') => ({
		primary: toHex(ink[side].primary),
		secondary: toHex(ink[side].secondary)
	});
	const hexA = hex('a');
	const hexB = hex('b');

	/* ── The proof ───────────────────────────────────────────────────────────
	   The halves do not touch, and within a half the checker and the teeth do
	   not overlap, so no point on the header carries more than one ink. That
	   makes "every point of the pattern" a set of five colours: the bare
	   surface — which is most of the gap — and each of the four inks composited
	   onto it at the motif's alpha. */
	const points: RGB[] = [
		base,
		composite(ink.a.primary, base, ALPHA),
		composite(ink.a.secondary, base, ALPHA),
		composite(ink.b.primary, base, ALPHA),
		composite(ink.b.secondary, base, ALPHA)
	];

	return {
		theme,
		a: { image: tileFor(tileA, 'a', hexA.primary, hexA.secondary), size: `${tileA}px ${tileA}px` },
		b: { image: tileFor(tileB, 'b', hexB.primary, hexB.secondary), size: `${tileB}px ${tileB}px` },
		badge: {
			a: { primary: toHex(raw.a.primary), secondary: toHex(raw.a.secondary) },
			b: { primary: toHex(raw.b.primary), secondary: toHex(raw.b.secondary) }
		},
		diagnostics: {
			ink: { a: hexA, b: hexB },
			collision,
			flat: {
				a: inksCollide(lch(ink.a.primary), lch(ink.a.secondary)),
				b: inksCollide(lch(ink.b.primary), lch(ink.b.secondary))
			},
			tile: { a: tileA, b: tileB },
			alpha: ALPHA,
			textContrast: Math.min(...points.map((p) => contrast(text, p)))
		}
	};
}
