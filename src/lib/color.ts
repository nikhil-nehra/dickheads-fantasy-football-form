/* ═══════════════════════════════════════════════════════════════════════════
   COLOUR
   ═══════════════════════════════════════════════════════════════════════════
   Enough colour science to make a texture out of a colour somebody picked in a
   survey, without letting that choice break the page.

   Two spaces are used, deliberately, for two different jobs:

   1. CIELAB / LCh decides what the ink SHOULD be. Lightness and hue there are
      perceptual, so "this colour is too light to see at 12% alpha" and "these
      two teams picked the same red" are questions with real answers. Doing that
      arithmetic in sRGB would call #ff0 and #00f equally light, which they are
      not.

   2. Plain sRGB decides what the reader will actually SEE. The browser
      composites a translucent fill over a background in sRGB, so any contrast
      check has to composite the same way or it is checking a different picture
      than the one on screen.

   Nothing here throws. Every input is a hex string typed by a person into a
   form, so the parser returns null rather than exploding and callers fall back.
   ═══════════════════════════════════════════════════════════════════════════ */

export type RGB = { r: number; g: number; b: number };
export type Lab = { L: number; a: number; b: number };
export type LCh = { L: number; C: number; h: number };

/* ── Parsing ─────────────────────────────────────────────────────────────── */

const HEX = /^#?([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

/**
 * Read a hex colour out of whatever somebody typed.
 *
 * Accepts `#abc`, `abc`, `#aabbcc`, and the 4-/8-digit forms with alpha, whose
 * alpha is DISCARDED — the pattern sets its own alpha, and letting a team's
 * colour carry one would silently break the ink budget.
 */
export function parseHex(input: string | null | undefined): RGB | null {
	const m = HEX.exec((input ?? '').trim());
	if (!m) return null;

	let h = m[1];
	if (h.length === 3 || h.length === 4) {
		h = h
			.slice(0, 3)
			.split('')
			.map((c) => c + c)
			.join('');
	}
	h = h.slice(0, 6);

	return {
		r: parseInt(h.slice(0, 2), 16),
		g: parseInt(h.slice(2, 4), 16),
		b: parseInt(h.slice(4, 6), 16)
	};
}

const clamp255 = (v: number) => Math.min(255, Math.max(0, Math.round(v)));

export function toHex({ r, g, b }: RGB): string {
	return '#' + [r, g, b].map((v) => clamp255(v).toString(16).padStart(2, '0')).join('');
}

/**
 * One canonical `#rrggbb` for a colour somebody typed, or null if it is not a
 * colour at all.
 *
 * A team colour is stored as a string and compared as a string — by the header
 * that asks whether two teams picked the same thing, and by the swatch grid
 * asking which of its sixteen is selected. Without this, `#B3122F`, `#b3122f`
 * and `b3122f` are three different colours to every one of those comparisons
 * and the same colour to every human looking at them.
 */
export function normaliseHex(input: string | null | undefined): string | null {
	const rgb = parseHex(input);
	return rgb ? toHex(rgb) : null;
}

/* ── sRGB transfer ───────────────────────────────────────────────────────── */

/** One channel, 0–255 gamma-encoded, to 0–1 linear light. */
export function toLinear(v: number): number {
	const x = v / 255;
	return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
}

/** Linear light 0–1 back to a gamma-encoded 0–255 channel. */
export function fromLinear(x: number): number {
	const v = x <= 0.0031308 ? x * 12.92 : 1.055 * x ** (1 / 2.4) - 0.055;
	return v * 255;
}

/* ── WCAG ────────────────────────────────────────────────────────────────── */

export function relativeLuminance(c: RGB): number {
	return 0.2126 * toLinear(c.r) + 0.7152 * toLinear(c.g) + 0.0722 * toLinear(c.b);
}

/** WCAG 2.x contrast ratio, 1–21. Order of the arguments does not matter. */
export function contrast(a: RGB, b: RGB): number {
	const [hi, lo] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
	return (hi + 0.05) / (lo + 0.05);
}

/**
 * `ink` painted over `base` at `alpha`, the way the browser will do it.
 *
 * Source-over in gamma-encoded sRGB, NOT in linear light. That is technically
 * the "wrong" way to blend light, and it is exactly what every browser does for
 * a fill-opacity over a background, so it is the right answer for predicting
 * what lands on screen.
 */
export function composite(ink: RGB, base: RGB, alpha: number): RGB {
	const a = Math.min(1, Math.max(0, alpha));
	return {
		r: ink.r * a + base.r * (1 - a),
		g: ink.g * a + base.g * (1 - a),
		b: ink.b * a + base.b * (1 - a)
	};
}

/* ── CIELAB / LCh ────────────────────────────────────────────────────────── */

// D65, 2° observer.
const Xn = 95.047;
const Yn = 100.0;
const Zn = 108.883;

const f = (t: number) => (t > 216 / 24389 ? Math.cbrt(t) : (841 / 108) * t + 4 / 29);
const fInv = (t: number) => (t > 6 / 29 ? t ** 3 : (108 / 841) * (t - 4 / 29));

export function rgbToLab(c: RGB): Lab {
	const [r, g, b] = [toLinear(c.r), toLinear(c.g), toLinear(c.b)];

	const X = (0.4124564 * r + 0.3575761 * g + 0.1804375 * b) * 100;
	const Y = (0.2126729 * r + 0.7151522 * g + 0.072175 * b) * 100;
	const Z = (0.0193339 * r + 0.119192 * g + 0.9503041 * b) * 100;

	const fx = f(X / Xn);
	const fy = f(Y / Yn);
	const fz = f(Z / Zn);

	return { L: 116 * fy - 16, a: 500 * (fx - fy), b: 200 * (fy - fz) };
}

/** May land outside the sRGB gamut; `fromLCh` is the one that guarantees it does not. */
export function labToRgb(lab: Lab): RGB {
	const fy = (lab.L + 16) / 116;
	const fx = fy + lab.a / 500;
	const fz = fy - lab.b / 200;

	const X = (fInv(fx) * Xn) / 100;
	const Y = (fInv(fy) * Yn) / 100;
	const Z = (fInv(fz) * Zn) / 100;

	return {
		r: fromLinear(3.2404542 * X - 1.5371385 * Y - 0.4985314 * Z),
		g: fromLinear(-0.969266 * X + 1.8760108 * Y + 0.041556 * Z),
		b: fromLinear(0.0556434 * X - 0.2040259 * Y + 1.0572252 * Z)
	};
}

export function toLCh(c: RGB): LCh {
	const lab = rgbToLab(c);
	const h = (Math.atan2(lab.b, lab.a) * 180) / Math.PI;
	return { L: lab.L, C: Math.hypot(lab.a, lab.b), h: h < 0 ? h + 360 : h };
}

/** True when every channel already sits inside 0–255 without clipping. */
function inGamut(c: RGB): boolean {
	const eps = 0.5 / 255;
	return [c.r, c.g, c.b].every((v) => v >= -eps * 255 && v <= 255 + eps * 255);
}

/**
 * LCh back to a colour that actually exists on a screen.
 *
 * Lightness and hue are held fixed and CHROMA is given up, by bisection, until
 * the result is in gamut. That order matters: clipping the channels instead
 * would shift the hue — push a saturated blue too light and naive clipping
 * walks it toward cyan — and hue is the one thing a team actually chose.
 */
export function fromLCh({ L, C, h }: LCh): RGB {
	const at = (chroma: number): RGB => {
		const rad = (h * Math.PI) / 180;
		return labToRgb({ L, a: Math.cos(rad) * chroma, b: Math.sin(rad) * chroma });
	};

	const full = at(C);
	if (inGamut(full)) return { r: clamp255(full.r), g: clamp255(full.g), b: clamp255(full.b) };

	let lo = 0;
	let hi = C;
	for (let i = 0; i < 24; i++) {
		const mid = (lo + hi) / 2;
		if (inGamut(at(mid))) lo = mid;
		else hi = mid;
	}

	const out = at(lo);
	return { r: clamp255(out.r), g: clamp255(out.g), b: clamp255(out.b) };
}

/**
 * The smallest angle between two hues, 0–180.
 *
 * Hue is a circle, so 350° and 10° are twenty degrees apart, not three hundred
 * and forty. Getting that wrong is what makes a "these two reds are identical"
 * check quietly never fire.
 */
export function hueDistance(h1: number, h2: number): number {
	const d = Math.abs(((h1 - h2) % 360) + 360) % 360;
	return d > 180 ? 360 - d : d;
}
