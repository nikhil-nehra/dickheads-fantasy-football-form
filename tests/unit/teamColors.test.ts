import { describe, it, expect } from 'vitest';
import { normaliseHex } from '../../src/lib/color';
import { colorsClash } from '../../src/lib/rivalryPattern';
import { ownValue, fieldStatus, type Entry } from '../../src/lib/negotiation';
import { rivalry } from '../../src/lib/surveys/rivalry';
import { allQuestions } from '../../src/lib/surveys/types';

/**
 * Team colours: the one rivalry line with nothing to agree.
 *
 * Everything else on the page settles when two people match. Colours settle
 * when they DON'T — which is why they get their own mode, their own read path
 * and their own tests rather than riding on the negotiation ones.
 */

const e = (field: string, pick: string | null): Entry => ({
	field_key: field,
	proposal: null,
	pick
});

describe('normalising a colour somebody typed', () => {
	it('folds case, shorthand and a missing hash to one form', () => {
		// All four of these are the same colour to a human and, without this,
		// four different strings to every comparison the app makes.
		for (const written of ['#B3122F', '#b3122f', 'b3122f', 'B3122F']) {
			expect(normaliseHex(written)).toBe('#b3122f');
		}
		expect(normaliseHex('#ABC')).toBe('#aabbcc');
	});

	it('drops the alpha rather than storing a colour that carries one', () => {
		// The pattern sets its own alpha. A colour arriving with one would
		// silently spend part of an 8% ink budget twice.
		expect(normaliseHex('#b3122f80')).toBe('#b3122f');
	});

	it('returns null for anything that is not a colour', () => {
		// The wheel cannot produce these; the hex box can, which is why the box
		// is parsed before anything is sent.
		for (const junk of ['', '  ', 'crimson', '#12345', 'rgb(1,2,3)', null, undefined]) {
			expect(normaliseHex(junk)).toBeNull();
		}
	});
});

describe('warning two teams off the same colour', () => {
	it('flags a pick that is near enough to the rival to read as one', () => {
		expect(colorsClash('#b3122f', '#b3122f')).toBe(true);
		// Different enough in the wheel, the same once lightness is clamped
		// into the band that survives an 8% wash. This is the whole reason the
		// warning exists — nobody would predict this pair by eye.
		expect(colorsClash('#c0392b', '#b93a26')).toBe(true);
	});

	it('says nothing about two colours that are plainly apart', () => {
		expect(colorsClash('#b3122f', '#2447b8')).toBe(false);
	});

	it('says nothing when either side has not picked', () => {
		// Silence, not a warning: nobody has done anything wrong yet.
		expect(colorsClash(null, '#b3122f')).toBe(false);
		expect(colorsClash('#b3122f', undefined)).toBe(false);
		expect(colorsClash('not a colour', '#b3122f')).toBe(false);
	});
});

describe('reading an own line', () => {
	it('is your own pick, with nothing derived from the other side', () => {
		expect(ownValue('colorPrimary', [e('colorPrimary', '#b3122f')])).toBe('#b3122f');
	});

	it('is null when you have not picked', () => {
		expect(ownValue('colorPrimary', [])).toBeNull();
		expect(ownValue('colorPrimary', [e('colorPrimary', null)])).toBeNull();
		expect(ownValue('colorPrimary', [e('colorPrimary', '   ')])).toBeNull();
	});

	it('never reads another field', () => {
		expect(ownValue('colorPrimary', [e('colorSecondary', '#d4a017')])).toBeNull();
	});

	it('is why an own line must not go through fieldStatus', () => {
		/* Two teams landing on the same red comes back "agreed" — which is the
		   exact opposite of what it is. This test exists to fail loudly if
		   anybody ever wires a colour line up to the negotiation reader. */
		const both = fieldStatus(
			'colorPrimary',
			[e('colorPrimary', '#b3122f')],
			[e('colorPrimary', '#b3122f')]
		);
		expect(both.state).toBe('agreed');
		expect(colorsClash('#b3122f', '#b3122f')).toBe(true);
	});
});

describe('the rivalry survey wiring', () => {
	const negQ = allQuestions(rivalry).find((q) => q.type === 'negotiation');
	if (!negQ || negQ.type !== 'negotiation') throw new Error('no negotiation question');

	it('declares exactly two colour fields, primary first', () => {
		// The board takes them in document order and never names a key.
		const colors = negQ.fields.filter((f) => f.kind === 'color');
		expect(colors.map((f) => f.key)).toEqual(['colorPrimary', 'colorSecondary']);
	});

	it('marks every colour field as own, and nothing else as own', () => {
		for (const f of negQ.fields) {
			expect(f.mode === 'own').toBe(f.kind === 'color');
		}
	});

	it('puts both colours in one group, so they render as one card', () => {
		const groups = new Set(negQ.fields.filter((f) => f.kind === 'color').map((f) => f.group));
		expect(groups.size).toBe(1);
		expect([...groups][0]).toBeTruthy();
	});

	it('offers no suggested colours — the wheel is the whole picker', () => {
		for (const f of negQ.fields) {
			expect(f).not.toHaveProperty('swatches');
		}
	});

	it('leaves the name compulsory and makes only the stakes declinable', () => {
		const optional = negQ.fields.filter((f) => f.optional).map((f) => f.key);
		expect(optional).toEqual(['bet', 'side']);
		for (const f of negQ.fields.filter((f) => f.optional)) {
			expect(f.optional?.decline).toBeTruthy();
			expect(f.optional?.none).toBeTruthy();
		}
	});
});

describe('the punishment ballot', () => {
	const podiumQ = allQuestions(rivalry).find((q) => q.id === 'podium');
	if (!podiumQ || podiumQ.type !== 'ballot') throw new Error('no podium question');

	it('is a closed ballot — no write-in, and nothing imported alongside it', () => {
		/* Both halves matter together. A write-in would let a fourteenth option
		   onto the ballot after some people had already ranked, so the early
		   voters and the late voters would be scoring different ballots; and
		   `importFrom` would re-add the thirteen raw intake strings next to the
		   cleaned-up versions they were edited into, splitting each vote
		   between an option and its own duplicate.

		   The server side is already covered by this: the write-in endpoint
		   rejects any question without a `writeIn`, so removing it here closes
		   the API too rather than just hiding the box. */
		expect(podiumQ.writeIn).toBeUndefined();
		expect(podiumQ.importFrom).toBeUndefined();
		expect(podiumQ.commissionerOptions?.length).toBeGreaterThan(podiumQ.podiumSize);
	});

	it('has no blank or duplicated options', () => {
		const opts = podiumQ.commissionerOptions ?? [];
		for (const o of opts) expect(o.trim().length).toBeGreaterThan(3);
		expect(new Set(opts.map((o) => o.trim().toLowerCase())).size).toBe(opts.length);
	});
});

describe('the victim question', () => {
	const targetQ = allQuestions(rivalry).find((q) => q.id === 'target');
	if (!targetQ || targetQ.type !== 'single') throw new Error('no target question');

	it('offers two resolvable options and a write-in', () => {
		/* Both of these are read off Sleeper by `resolveVictim`. The three that
		   were dropped were either variations fine enough to split their own
		   vote, or a "both" that made the victim two people. */
		expect(targetQ.options.map((o) => o.id)).toEqual(['reg-last', 'toilet']);
		expect(targetQ.writeIn?.label).toBe('Something else');
	});
});
