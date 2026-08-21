import { describe, it, expect } from 'vitest';
import {
	composite,
	contrast,
	fromLCh,
	hueDistance,
	parseHex,
	relativeLuminance,
	rgbToLab,
	toHex,
	toLCh
} from '../../src/lib/color';

describe('parseHex', () => {
	it('reads the forms people actually type', () => {
		expect(parseHex('#a32638')).toEqual({ r: 163, g: 38, b: 56 });
		expect(parseHex('a32638')).toEqual({ r: 163, g: 38, b: 56 });
		expect(parseHex('  #A32638  ')).toEqual({ r: 163, g: 38, b: 56 });
		expect(parseHex('#abc')).toEqual({ r: 170, g: 187, b: 204 });
	});

	it('drops any alpha the picker tacked on', () => {
		// The pattern owns the alpha budget. A colour arriving with its own would
		// silently blow it.
		expect(parseHex('#a3263880')).toEqual({ r: 163, g: 38, b: 56 });
		expect(parseHex('#abcd')).toEqual({ r: 170, g: 187, b: 204 });
	});

	it('returns null rather than throwing on nonsense', () => {
		// Every one of these is a thing a survey field can contain.
		for (const bad of ['', '   ', 'red', '#12345', '#gggggg', 'rgb(1,2,3)', null, undefined]) {
			expect(parseHex(bad as string), String(bad)).toBeNull();
		}
	});
});

describe('CIELAB', () => {
	it('puts white, black and mid grey where they belong', () => {
		expect(rgbToLab({ r: 255, g: 255, b: 255 }).L).toBeCloseTo(100, 3);
		expect(rgbToLab({ r: 0, g: 0, b: 0 }).L).toBeCloseTo(0, 3);
		// 50% sRGB grey is L* ~53, not 50 — which is the whole reason this file
		// does not do lightness arithmetic in sRGB.
		expect(rgbToLab({ r: 128, g: 128, b: 128 }).L).toBeGreaterThan(52);
		expect(rgbToLab({ r: 128, g: 128, b: 128 }).L).toBeLessThan(54);
	});

	it('rates yellow far lighter than blue, which sRGB does not', () => {
		expect(rgbToLab({ r: 255, g: 255, b: 0 }).L).toBeGreaterThan(90);
		expect(rgbToLab({ r: 0, g: 0, b: 255 }).L).toBeLessThan(40);
	});

	it('round-trips through LCh', () => {
		for (const hex of ['#a32638', '#173456', '#c9a227', '#125c62', '#f4efe2', '#0b1a11']) {
			const rgb = parseHex(hex)!;
			const back = fromLCh(toLCh(rgb));
			expect(back.r, hex).toBeCloseTo(rgb.r, 0);
			expect(back.g, hex).toBeCloseTo(rgb.g, 0);
			expect(back.b, hex).toBeCloseTo(rgb.b, 0);
		}
	});

	it('gives up chroma, not hue, when a colour leaves the gamut', () => {
		// A vivid red asked for at a lightness that cannot hold it. The result
		// must still be reddish rather than clipped into something else.
		//
		// L* 75 rather than 95 on purpose: at 95 the surviving chroma is so small
		// that rounding to integer channels moves the hue several degrees, which
		// says nothing about whether the mapping preserves hue.
		const asked = { L: 75, C: 110, h: 30 };
		const got = toLCh(fromLCh(asked));
		expect(got.L).toBeCloseTo(75, 0);
		expect(got.C).toBeLessThan(110);
		expect(hueDistance(got.h, 30)).toBeLessThan(3);
	});
});

describe('hueDistance', () => {
	it('measures across the wrap, not around it', () => {
		expect(hueDistance(350, 10)).toBeCloseTo(20, 6);
		expect(hueDistance(10, 350)).toBeCloseTo(20, 6);
		expect(hueDistance(0, 180)).toBeCloseTo(180, 6);
		expect(hueDistance(90, 90)).toBeCloseTo(0, 6);
	});

	it('never exceeds 180', () => {
		for (let a = 0; a < 360; a += 17) {
			for (let b = 0; b < 360; b += 23) {
				expect(hueDistance(a, b)).toBeLessThanOrEqual(180);
			}
		}
	});
});

describe('contrast', () => {
	it('agrees with the known extremes', () => {
		const white = { r: 255, g: 255, b: 255 };
		const black = { r: 0, g: 0, b: 0 };
		expect(contrast(white, black)).toBeCloseTo(21, 1);
		expect(contrast(white, white)).toBeCloseTo(1, 6);
	});

	it('does not care which way round the arguments go', () => {
		const a = parseHex('#a32638')!;
		const b = parseHex('#f4efe2')!;
		expect(contrast(a, b)).toBeCloseTo(contrast(b, a), 9);
	});
});

describe('composite', () => {
	it('blends in gamma space, the way the browser will', () => {
		const out = composite({ r: 0, g: 0, b: 0 }, { r: 255, g: 255, b: 255 }, 0.5);
		// 127.5, not the 186 a linear-light blend would give. Predicting the
		// browser matters more here than being physically correct.
		expect(out.r).toBeCloseTo(127.5, 6);
	});

	it('is a no-op at zero and a replacement at one', () => {
		const ink = { r: 10, g: 20, b: 30 };
		const base = { r: 200, g: 210, b: 220 };
		expect(composite(ink, base, 0)).toEqual(base);
		expect(composite(ink, base, 1)).toEqual(ink);
	});

	it('clamps an alpha outside 0–1 instead of extrapolating', () => {
		const ink = { r: 0, g: 0, b: 0 };
		const base = { r: 255, g: 255, b: 255 };
		expect(composite(ink, base, 3).r).toBe(0);
		expect(composite(ink, base, -2).r).toBe(255);
	});
});

describe('relativeLuminance', () => {
	it('matches the WCAG reference points', () => {
		expect(relativeLuminance({ r: 255, g: 255, b: 255 })).toBeCloseTo(1, 6);
		expect(relativeLuminance({ r: 0, g: 0, b: 0 })).toBeCloseTo(0, 6);
	});
});

describe('toHex', () => {
	it('rounds and clamps whatever the maths produced', () => {
		expect(toHex({ r: 163.4, g: 37.6, b: 56 })).toBe('#a32638');
		expect(toHex({ r: -5, g: 300, b: 0 })).toBe('#00ff00');
	});
});
