import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
	ALPHA,
	ALPHA_RANGE,
	MIN_TEXT_CONTRAST,
	SURFACE,
	TEXT_INK,
	TILE,
	inksCollide,
	resolveInk,
	rivalryPattern,
	type Theme,
	type TeamColors
} from '../../src/lib/rivalryPattern';
import { composite, contrast, parseHex, rgbToLab, toLCh } from '../../src/lib/color';

const THEMES: Theme[] = ['light', 'dark'];

/** A team whose two picks are plainly different, so nothing else is in play. */
const team = (primary: string, secondary: string): TeamColors => ({ primary, secondary });

/** The two well-separated teams most tests want. */
const RED = team('#a32638', '#c9a227');
const TEAL = team('#125c62', '#f0ead6');

/** Easy, colliding, and the extremes. */
const PAIRS: [TeamColors, TeamColors][] = [
	[RED, TEAL],
	[team('#c0392b', '#a93226'), team('#b93a26', '#a5301f')],
	[team('#ffffff', '#000000'), team('#000000', '#ffffff')]
];

/** Every hex that appears anywhere in a generated tile. */
function inksIn(css: string): string[] {
	return [...css.matchAll(/%23([0-9a-fA-F]{6})/g)].map((m) => '#' + m[1].toLowerCase());
}

/** The decoded SVG behind a `url("data:…")` value. */
function svgOf(image: string): string {
	return decodeURIComponent(image.slice(image.indexOf(',') + 1, -2));
}

describe('the surfaces it composites against', () => {
	it('still match app.css', () => {
		// The contrast proof below runs in Node with no stylesheet. If --surface or
		// --ink move and these do not, the proof silently starts proving nothing.
		const css = readFileSync('src/lib/styles/app.css', 'utf8');

		const light = /:root\s*\{[\s\S]*?--surface:\s*(#[0-9a-f]{3,8});/i.exec(css);
		expect(light?.[1].toLowerCase()).toBe(SURFACE.light);

		const dark = /:root\[data-theme='dark'\]\s*\{[\s\S]*?--surface:\s*(#[0-9a-f]{3,8});/i.exec(css);
		expect(dark?.[1].toLowerCase()).toBe(SURFACE.dark);

		expect(css).toContain(`--ink: ${TEXT_INK.light}`);
		expect(css).toContain(`--ink: ${TEXT_INK.dark}`);
	});
});

describe('nothing between the two halves', () => {
	/* The point of this whole section: the two sides stop, and between them is
	   bare surface. No interlock, no dither, no cross-fade, no mask feathering,
	   no rule down the middle. If any of that creeps back in it will show up
	   here before it shows up on screen. */

	it('returns two halves and no third thing between them', () => {
		const p = rivalryPattern(RED, TEAL, 'dark');
		expect(Object.keys(p).sort()).toEqual(['a', 'b', 'badge', 'diagnostics', 'theme']);
		expect(Object.keys(p.a).sort()).toEqual(['image', 'size']);
		expect(Object.keys(p.b).sort()).toEqual(['image', 'size']);
	});

	it('emits no gradient and no mask anywhere', () => {
		// The edge is a box boundary in the component, so neither word should
		// appear in anything this function produces.
		for (const theme of THEMES) {
			for (const [a, b] of PAIRS) {
				const json = JSON.stringify(rivalryPattern(a, b, theme));
				const label = `${a.primary}/${b.primary}/${theme}`;
				expect(json, label).not.toMatch(/gradient/i);
				expect(json, label).not.toMatch(/mask/i);
			}
		}
	});

	it('draws no blur, glow or shadow', () => {
		for (const theme of THEMES) {
			const p = rivalryPattern(RED, TEAL, theme);
			for (const half of [p.a, p.b]) {
				expect(svgOf(half.image)).not.toMatch(/blur|shadow|glow|feGaussian|filter/i);
			}
		}
	});

	it('paints each half in exactly one flat alpha, with no ramp', () => {
		// One fill-opacity across BOTH paths of a tile. A second value would be a
		// fade by another name — the tile getting lighter toward the edge.
		const p = rivalryPattern(RED, TEAL, 'dark');
		for (const half of [p.a, p.b]) {
			const alphas = new Set(
				[...svgOf(half.image).matchAll(/fill-opacity="([^"]+)"/g)].map((m) => m[1])
			);
			expect([...alphas]).toEqual([String(ALPHA)]);
		}
	});
});

describe('determinism', () => {
	it('gives the same colours the same header every time', () => {
		const a = rivalryPattern(RED, TEAL, 'dark');
		const b = rivalryPattern(RED, TEAL, 'dark');
		expect(JSON.stringify(a)).toBe(JSON.stringify(b));
	});

	it('keeps its geometry when only the theme changes', () => {
		const l = rivalryPattern(RED, TEAL, 'light');
		const d = rivalryPattern(RED, TEAL, 'dark');
		// Only the ink may differ. The component leans on this: it hands CSS one
		// set of sizes and swaps only the images between themes.
		expect(l.a.size).toBe(d.a.size);
		expect(l.b.size).toBe(d.b.size);
		expect(l.a.image).not.toBe(d.a.image);
	});
});

describe('the brief', () => {
	it('keeps every tile between 20 and 48px', () => {
		for (const [a, b] of PAIRS) {
			const p = rivalryPattern(a, b, 'dark');
			for (const t of [p.diagnostics.tile.a, p.diagnostics.tile.b]) {
				expect(t).toBeGreaterThanOrEqual(20);
				expect(t).toBeLessThanOrEqual(48);
			}
		}
	});

	it('keeps ink alpha inside 8–14%', () => {
		expect(ALPHA).toBeGreaterThanOrEqual(ALPHA_RANGE.min);
		expect(ALPHA).toBeLessThanOrEqual(ALPHA_RANGE.max);
		expect(rivalryPattern(RED, TEAL, 'light').diagnostics.alpha).toBe(ALPHA);
	});

	it('sizes both halves in px, never in percent', () => {
		// A percentage size would scale the motif with the header, which is the
		// whole reason the halves are separate boxes rather than one image.
		const p = rivalryPattern(RED, TEAL, 'dark');
		for (const half of [p.a, p.b]) {
			expect(half.size).toMatch(/^\d+(\.\d+)?px \d+(\.\d+)?px$/);
		}
	});

	it('uses one motif and one motif only', () => {
		// Houndstooth: a checker of two squares plus two teeth. Nothing else may
		// appear — no circles, no dashes, no stroked hatching.
		const p = rivalryPattern(RED, TEAL, 'dark');
		for (const half of [p.a, p.b]) {
			const svg = svgOf(half.image);
			expect(svg).not.toMatch(/<circle|stroke-dasharray|stroke-linecap|stroke=/);
			expect(svg).toContain(`<path d="M0 0h${TILE / 2}v${TILE / 2}h-${TILE / 2}z`);
		}
	});

	it('mirrors the motif for side b, so greyscale still separates the halves', () => {
		const p = rivalryPattern(RED, TEAL, 'dark');
		expect(svgOf(p.a.image)).not.toContain('scale(-1 1)');
		expect(svgOf(p.b.image)).toContain('scale(-1 1)');
	});

	it('paints only that side\u2019s two resolved inks, and nothing else', () => {
		const p = rivalryPattern(RED, TEAL, 'dark');
		expect(inksIn(p.a.image)).toEqual([p.diagnostics.ink.a.primary, p.diagnostics.ink.a.secondary]);
		expect(inksIn(p.b.image)).toEqual([p.diagnostics.ink.b.primary, p.diagnostics.ink.b.secondary]);
	});

	it('gives the checker to the primary and the teeth to the secondary', () => {
		/* Two thirds of the inked area is checker, so this is what decides which
		   of a team\u2019s two picks reads as "their colour". */
		const p = rivalryPattern(RED, TEAL, 'dark');
		const svg = svgOf(p.a.image);
		const checker = new RegExp(`<path d="M0 0h${TILE / 2}[^"]*" fill="([^"]+)"`).exec(svg);
		const teeth = new RegExp(`<path d="M${TILE / 2} 0l[^"]*" fill="([^"]+)"`).exec(svg);
		expect(checker?.[1]).toBe(p.diagnostics.ink.a.primary);
		expect(teeth?.[1]).toBe(p.diagnostics.ink.a.secondary);
	});

	it('never lets the checker and the teeth overlap', () => {
		/* The alpha budget depends on it: an overlap would stack two inks and
		   double the effective alpha exactly where they cross. */
		const u = TILE / 2;
		const p = rivalryPattern(RED, TEAL, 'dark');
		const svg = svgOf(p.a.image);
		// The checker owns the two diagonal cells; the teeth own halves of the
		// other two. Neither path may mention a cell origin the other claims.
		expect(svg).toContain(`M0 0h${u}v${u}h-${u}zM${u} ${u}h${u}v${u}h-${u}z`);
		expect(svg).toContain(`M${u} 0l${u} ${u}v-${u}zM0 ${u}l${u} ${u}h-${u}z`);
	});

	it('reports a team whose own two picks read as one tone', () => {
		const flat = rivalryPattern(team('#c0392b', '#c33a2d'), TEAL, 'dark');
		expect(flat.diagnostics.flat.a).toBe(true);
		expect(flat.diagnostics.flat.b).toBe(false);
		/* Two picks that close resolve to the SAME ink — the clamp lands them on
		   one value — so that half really is one tone. That is the honest result
		   of their choice, and nothing is done about it: no remedy fires, and the
		   tiles stay the same size. */
		expect(flat.diagnostics.ink.a.primary).toBe(flat.diagnostics.ink.a.secondary);
		expect(flat.diagnostics.collision).toBe(false);
		expect(flat.diagnostics.tile.a).toBe(flat.diagnostics.tile.b);
	});

	it('emits well-formed, self-contained SVG data URIs', () => {
		const p = rivalryPattern(RED, TEAL, 'dark');
		for (const half of [p.a, p.b]) {
			expect(half.image).toMatch(/^url\("data:image\/svg\+xml,/);
			const svg = svgOf(half.image);
			expect(svg).toMatch(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
			expect(svg.endsWith('</svg>')).toBe(true);
			// Vector only, and nothing fetched from anywhere.
			expect(svg).not.toMatch(/<image|href=|url\(http/i);
		}
	});
});

describe('text contrast', () => {
	/* The rule that matters most: header text clears 7:1 against every point of
	   the pattern, on every theme, for any pair of colours a survey can produce. */
	it('clears 7:1 for a wide sweep of colour pairs, in both themes', () => {
		let worst = Infinity;
		let worstCase = '';

		for (let i = 0; i < 300; i++) {
			// Deterministic sweep across the whole cube, including the corners
			// that break naive implementations.
			const hex = (n: number) =>
				'#' +
				[(n * 37) % 256, (n * 91) % 256, (n * 173) % 256]
					.map((v) => v.toString(16).padStart(2, '0'))
					.join('');
			// All four colours vary, so the sweep covers secondaries as well.
			const a = team(hex(i), hex(i * 3 + 5));
			const b = team(hex(i * 7 + 13), hex(i * 11 + 29));

			for (const theme of THEMES) {
				const p = rivalryPattern(a, b, theme);
				const label = `${a.primary}+${a.secondary} vs ${b.primary}+${b.secondary} on ${theme}`;
				if (p.diagnostics.textContrast < worst) {
					worst = p.diagnostics.textContrast;
					worstCase = label;
				}
				expect(p.diagnostics.textContrast, label).toBeGreaterThanOrEqual(MIN_TEXT_CONTRAST);
			}
		}

		// Not just passing — passing with room. If this ever drops near 7 the
		// alpha budget has crept up.
		expect(worst, worstCase).toBeGreaterThan(8);
	});

	it('recomputes the reported figure independently of the generator', () => {
		// The generator reports a number; this rebuilds it from the raw ink, so a
		// bug in its own arithmetic cannot hide behind its own claim.
		for (const theme of THEMES) {
			const p = rivalryPattern(team('#ffffff', '#000000'), team('#000000', '#ffffff'), theme);
			const base = parseHex(SURFACE[theme])!;
			const text = parseHex(TEXT_INK[theme])!;

			const inks = [
				p.diagnostics.ink.a.primary,
				p.diagnostics.ink.a.secondary,
				p.diagnostics.ink.b.primary,
				p.diagnostics.ink.b.secondary
			];
			const worst = Math.min(
				contrast(text, base),
				...inks.map((ink) => contrast(text, composite(parseHex(ink)!, base, p.diagnostics.alpha)))
			);

			// The generator also folds in the seam rule when there is one, so its
			// figure can only be lower or equal.
			expect(p.diagnostics.textContrast).toBeLessThanOrEqual(worst + 1e-9);
			expect(p.diagnostics.textContrast).toBeGreaterThanOrEqual(MIN_TEXT_CONTRAST);
		}
	});

	it('holds even when both teams pick the theme background itself', () => {
		for (const theme of THEMES) {
			const p = rivalryPattern(
				team(SURFACE[theme], SURFACE[theme]),
				team(SURFACE[theme], SURFACE[theme]),
				theme
			);
			expect(p.diagnostics.textContrast).toBeGreaterThanOrEqual(MIN_TEXT_CONTRAST);
		}
	});
});

describe('ink resolution', () => {
	it('pulls a very light colour down so it survives on white', () => {
		// L* 96 pastel: at 8% over white it would be invisible.
		const pastel = parseHex('#fdf6d8')!;
		expect(rgbToLab(pastel).L).toBeGreaterThan(85);

		const ink = resolveInk(pastel, 'light');
		expect(rgbToLab(ink).L).toBeLessThanOrEqual(38.001);
		// And it is still the same colour family, not a neutral.
		expect(Math.abs(toLCh(ink).h - toLCh(pastel).h)).toBeLessThan(8);
	});

	it('pushes a very dark colour up so it survives on the dark field', () => {
		const navy = parseHex('#0b1c38')!;
		expect(rgbToLab(navy).L).toBeLessThan(20);

		const ink = resolveInk(navy, 'dark');
		// 83.5, not 84: the result is rounded to integer channels, which can land
		// a tenth of an L* short of the target.
		expect(rgbToLab(ink).L).toBeGreaterThanOrEqual(83.5);
		expect(Math.abs(toLCh(ink).h - toLCh(navy).h)).toBeLessThan(10);
	});

	it('leaves the lightness alone when it is already in range', () => {
		// Chroma still moves — the nudge applies to every colour — so this pins
		// the lightness only.
		const mid = parseHex('#8f2233')!;
		const L = rgbToLab(mid).L;
		expect(L).toBeLessThan(38);
		expect(Math.abs(rgbToLab(resolveInk(mid, 'light')).L - L)).toBeLessThan(0.2);
	});

	it('does not invent a hue for somebody who picked grey', () => {
		// Nudging chroma up is fine for a colour. Doing it to slate would put a
		// colour in a team's mouth they never chose.
		for (const grey of ['#808080', '#2b2b2b', '#e0e0e0']) {
			for (const theme of THEMES) {
				expect(toLCh(resolveInk(parseHex(grey)!, theme)).C, `${grey}/${theme}`).toBeLessThan(2);
			}
		}
	});

	it('keeps the real colour for badges, whatever it did to the ink', () => {
		const p = rivalryPattern(team('#fdf6d8', '#fff8e0'), team('#fffbe6', '#fdf9dd'), 'light');
		expect(p.badge.a).toEqual({ primary: '#fdf6d8', secondary: '#fff8e0' });
		expect(p.badge.b).toEqual({ primary: '#fffbe6', secondary: '#fdf9dd' });
		expect(p.diagnostics.ink.a.primary).not.toBe('#fdf6d8');
	});

	it('falls back instead of throwing when a colour is unreadable', () => {
		const p = rivalryPattern(team('not a colour', ''), team('#12345', 'rgb(1,2,3)'), 'dark');
		expect(p.a.image).toContain('data:image/svg+xml');
		expect(p.diagnostics.textContrast).toBeGreaterThanOrEqual(MIN_TEXT_CONTRAST);
	});
});

describe('colours that cannot carry the split', () => {
	it('detects two near-identical reds', () => {
		const p = rivalryPattern(team('#c0392b', '#a93226'), team('#b93a26', '#a5301f'), 'dark');
		expect(p.diagnostics.collision).toBe(true);
	});

	it('detects a pair separated only by lightness, which ink resolution flattens', () => {
		// Bright red against maroon looks different in a picker and arrives as the
		// same ink. Checking the raw colours would miss it.
		const p = rivalryPattern(team('#ff2d1a', '#ff6a3a'), team('#5e0f08', '#7a2a12'), 'dark');
		expect(p.diagnostics.collision).toBe(true);
	});

	it('does NOT fire when only the primaries collide', () => {
		/* Both pairs have to be close. If the trims plainly differ you can already
		   tell the halves apart, and growing one side's tile would be a heavy
		   remedy for a problem that is not there. */
		const p = rivalryPattern(team('#c0392b', '#125c62'), team('#b93a26', '#c9a227'), 'dark');
		expect(p.diagnostics.collision).toBe(false);
		expect(p.diagnostics.tile.a).toBe(p.diagnostics.tile.b);
	});

	it('does not fire for colours that plainly differ', () => {
		expect(rivalryPattern(RED, TEAL, 'dark').diagnostics.collision).toBe(false);
	});

	it('differentiates by tile scale when it does fire', () => {
		/* Scale is the ONLY remedy now. The gap already shows there are two
		   sides; what two near-identical reds still need is a way to tell which
		   is which, and a coarser lattice on one side does that in greyscale as
		   well as in colour. */
		const p = rivalryPattern(team('#c0392b', '#a93226'), team('#b93a26', '#a5301f'), 'dark');
		expect(p.diagnostics.tile.b).toBeGreaterThan(p.diagnostics.tile.a);
		expect(p.b.size).not.toBe(p.a.size);
	});

	it('treats two greys as a collision, since hue cannot separate them', () => {
		expect(inksCollide(toLCh(parseHex('#777777')!), toLCh(parseHex('#999999')!))).toBe(true);
	});

	it('does not treat grey against a real colour as a collision', () => {
		expect(inksCollide(toLCh(parseHex('#777777')!), toLCh(parseHex('#a32638')!))).toBe(false);
	});
});
