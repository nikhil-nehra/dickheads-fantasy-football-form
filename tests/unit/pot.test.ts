import { describe, it, expect } from 'vitest';
import {
	PLACEMENTS,
	PLACES,
	ledger,
	parsePlacementKey,
	parsePot,
	payouts,
	placementKey,
	placementLabel,
	samePlacement,
	validatePot
} from '../../src/lib/pot';
import type { Place, SplitSlice } from '../../src/lib/pot';

const final = (place: Place, pct: number): SplitSlice => ({ bracket: 'final', place, pct });
const regular = (place: Place, pct: number): SplitSlice => ({ bracket: 'regular', place, pct });

describe('validatePot', () => {
	it('accepts a buy-in and a split that totals 100', () => {
		const r = validatePot({ buyIn: 50, split: [final(1, 70), final(2, 30)] });
		expect(r.ok).toBe(true);
		if (r.ok) expect(r.value.split).toHaveLength(2);
	});

	it('rejects a split that does not total 100', () => {
		// The one error worth being strict about: every figure the board prints
		// is a percentage OF the pot.
		const r = validatePot({ buyIn: 50, split: [final(1, 60), final(2, 30)] });
		expect(r.ok).toBe(false);
		if (!r.ok) expect(r.problems[0].message).toMatch(/totals 90%/);
	});

	it('allows an empty split — "not decided yet" is a real state', () => {
		const r = validatePot({ buyIn: 50, split: [] });
		expect(r.ok).toBe(true);
		if (r.ok) expect(r.value.split).toEqual([]);
	});

	it('rejects a fractional or negative buy-in', () => {
		expect(validatePot({ buyIn: 12.5, split: [] }).ok).toBe(false);
		expect(validatePot({ buyIn: -5, split: [] }).ok).toBe(false);
	});

	it('rejects a nonsense percent', () => {
		expect(validatePot({ buyIn: 50, split: [final(1, 0)] }).ok).toBe(false);
		expect(validatePot({ buyIn: 50, split: [final(1, 101)] }).ok).toBe(false);
		expect(validatePot({ buyIn: 50, split: [final(1, 12.5)] }).ok).toBe(false);
	});

	/* The whole point of typing a slice. None of these can be built in the
	   editor any more, and none of them survive the door if something else
	   posts them. */
	it('refuses a slice that does not name a real placement', () => {
		const bad = [
			{ pct: 100 },
			{ bracket: 'final', pct: 100 },
			{ bracket: 'playoffs', place: 1, pct: 100 },
			{ bracket: 'final', place: 0, pct: 100 },
			{ bracket: 'final', place: 15, pct: 100 },
			{ bracket: 'final', place: 1.5, pct: 100 },
			{ bracket: 'final', place: '1', pct: 100 },
			{ label: '1st place', pct: 100 }
		];
		for (const slice of bad) {
			expect(validatePot({ buyIn: 50, split: [slice] }).ok).toBe(false);
		}
	});

	it('refuses to pay the same placement twice', () => {
		const r = validatePot({ buyIn: 50, split: [final(1, 50), final(1, 50)] });
		expect(r.ok).toBe(false);
		if (!r.ok) expect(r.problems.some((p) => /twice/.test(p.message))).toBe(true);
	});

	it('keeps the two tables apart — same place, different bracket', () => {
		const r = validatePot({ buyIn: 50, split: [final(1, 60), regular(1, 40)] });
		expect(r.ok).toBe(true);
		if (r.ok) expect(r.value.split).toHaveLength(2);
	});

	it('caps the number of slices', () => {
		const many = PLACES.slice(0, 9).map((p) => final(p, 11));
		expect(validatePot({ buyIn: 50, split: many }).ok).toBe(false);
	});
});

describe('placements', () => {
	it('offers 1st through 14th in both tables and nothing else', () => {
		expect(PLACES).toHaveLength(14);
		expect(PLACEMENTS).toHaveLength(28);
	});

	it('derives a label rather than storing one', () => {
		expect(placementLabel({ bracket: 'final', place: 1 })).toBe('1st place');
		expect(placementLabel({ bracket: 'final', place: 3 })).toBe('3rd place');
		expect(placementLabel({ bracket: 'regular', place: 1 })).toBe('1st place, regular season');
		expect(placementLabel({ bracket: 'regular', place: 14 })).toBe('14th place, regular season');
	});

	// A fourteen-team league runs straight through the exception where the
	// last digit lies. "11st place" would have been printed on the board.
	it('gets the teens right', () => {
		expect(placementLabel({ bracket: 'final', place: 11 })).toBe('11th place');
		expect(placementLabel({ bracket: 'final', place: 12 })).toBe('12th place');
		expect(placementLabel({ bracket: 'final', place: 13 })).toBe('13th place');
	});

	it('round-trips through a key', () => {
		for (const p of PLACEMENTS) {
			expect(parsePlacementKey(placementKey(p))).toEqual(p);
		}
	});

	it('refuses a key that is not a placement', () => {
		expect(parsePlacementKey('final:0')).toBeNull();
		expect(parsePlacementKey('final:15')).toBeNull();
		expect(parsePlacementKey('playoffs:1')).toBeNull();
		expect(parsePlacementKey('nonsense')).toBeNull();
	});

	it('tells the two tables apart at the same place', () => {
		expect(samePlacement({ bracket: 'final', place: 1 }, { bracket: 'regular', place: 1 })).toBe(
			false
		);
		expect(samePlacement({ bracket: 'final', place: 1 }, { bracket: 'final', place: 1 })).toBe(true);
	});
});

describe('the regular season', () => {
	it('is a table, not a carve-out — it pays as deep as you like', () => {
		// The whole point: more than one regular-season placement can take a cut.
		const r = validatePot({
			buyIn: 50,
			split: [final(1, 45), final(2, 25), regular(1, 20), regular(2, 10)]
		});
		expect(r.ok).toBe(true);
		if (r.ok) {
			expect(r.value.split.filter((sl) => sl.bracket === 'regular')).toHaveLength(2);
			const cuts = payouts(r.value.split, 700);
			expect(cuts.map((c) => c.label)).toEqual([
				'1st place',
				'2nd place',
				'1st place, regular season',
				'2nd place, regular season'
			]);
			expect(cuts.reduce((a, b) => a + b.amount, 0)).toBe(700);
		}
	});

	it('can take the whole pot on its own if that is the decision', () => {
		const r = validatePot({
			buyIn: 50,
			split: [regular(1, 60), regular(2, 30), regular(3, 10)]
		});
		expect(r.ok).toBe(true);
	});

	it('still refuses the same regular-season place twice', () => {
		const r = validatePot({ buyIn: 50, split: [regular(2, 50), regular(2, 50)] });
		expect(r.ok).toBe(false);
		if (!r.ok) expect(r.problems.some((p) => /twice/.test(p.message))).toBe(true);
	});
});

describe('parsePot', () => {
	it('survives anything hand-edited into the column', () => {
		expect(parsePot(50, 'not json')).toEqual({ buyIn: 50, split: [] });
		expect(parsePot(null, null)).toEqual({ buyIn: 0, split: [] });
		expect(parsePot(50, '{"not":"an array"}')).toEqual({ buyIn: 50, split: [] });
	});

	it('reads the typed shape back', () => {
		const p = parsePot(50, '[{"bracket":"final","place":1,"pct":60},{"bracket":"regular","place":1,"pct":40}]');
		expect(p.split).toEqual([final(1, 60), regular(1, 40)]);
	});

	it('drops a slice with no percent', () => {
		const p = parsePot(50, '[{"bracket":"final","place":1,"pct":100},{"bracket":"final","place":2,"pct":0}]');
		expect(p.split).toEqual([final(1, 100)]);
	});

	/* Rows written before slices were typed are still on disk. The read path
	   understands them; the next save from the Desk rewrites the column. */
	it('migrates the labelled rows already in the database', () => {
		const p = parsePot(
			50,
			'[{"label":"1st place","pct":60},{"label":"2nd place","pct":30},{"label":"1st place, regular season","pct":10}]'
		);
		expect(p.split).toEqual([final(1, 60), final(2, 30), regular(1, 10)]);
	});

	it('migrates the wordings the survey and the old editor used', () => {
		// The intake carve-out's own phrasing, and the "1th place" the old
		// add-a-slice button wrote.
		expect(parsePot(50, '[{"label":"Regular-season points leader","pct":100}]').split).toEqual([
			regular(1, 100)
		]);
		expect(parsePot(50, '[{"label":"1th place","pct":100}]').split).toEqual([final(1, 100)]);
		expect(parsePot(50, '[{"label":"  14TH  PLACE , Regular Season ","pct":100}]').split).toEqual([
			regular(14, 100)
		]);
	});

	it('drops a label it cannot read rather than guessing a placement', () => {
		// Printing a seat nobody chose, with money against it, is worse than
		// printing a split that visibly does not add up.
		const p = parsePot(50, '[{"label":"1st place","pct":90},{"label":"Toilet bowl champion","pct":10}]');
		expect(p.split).toEqual([final(1, 90)]);
	});
});

describe('payouts', () => {
	it('turns percentages into dollars', () => {
		const cuts = payouts([final(1, 60), final(2, 40)], 700);
		expect(cuts.map((c) => c.amount)).toEqual([420, 280]);
	});

	it('carries the derived label, so the board never reads a stored one', () => {
		const cuts = payouts([final(1, 60), regular(1, 40)], 700);
		expect(cuts.map((c) => c.label)).toEqual(['1st place', '1st place, regular season']);
	});

	it('always adds up to the pot exactly', () => {
		// 3 x 33% + 1% of $700 rounds per-slice to 231+231+231+7 = 700, where
		// naive independent rounding gives 699.
		const split = [final(1, 33), final(2, 33), final(3, 33), final(4, 1)];
		const cuts = payouts(split, 700);
		expect(cuts.reduce((a, b) => a + b.amount, 0)).toBe(700);
	});

	it('adds up for a lot of awkward pot sizes', () => {
		const split = [final(1, 45), final(2, 25), final(3, 15), final(4, 10), final(5, 5)];
		for (const pot of [1, 7, 13, 99, 350, 700, 1234, 9999]) {
			expect(payouts(split, pot).reduce((a, b) => a + b.amount, 0)).toBe(pot);
		}
	});

	it('is empty when no split is set', () => {
		expect(payouts([], 700)).toEqual([]);
	});
});

describe('ledger', () => {
	const roster = [
		{ id: 'a', display_name: 'Alice' },
		{ id: 'b', display_name: 'Bob' },
		{ id: 'c', display_name: 'Carol' }
	];

	it('splits the roster into paid and owing', () => {
		const l = ledger(roster, [{ player_id: 'a', paid: 1 }], 50);
		expect(l.paid.map((x) => x.name)).toEqual(['Alice']);
		expect(l.owing.map((x) => x.name)).toEqual(['Bob', 'Carol']);
	});

	it('treats a missing row as unpaid, so nothing has to be seeded', () => {
		const l = ledger(roster, [], 50);
		expect(l.paid).toHaveLength(0);
		expect(l.owing).toHaveLength(3);
		expect(l.collected).toBe(0);
	});

	it('treats an explicit paid=0 row as unpaid too', () => {
		// Un-marking someone writes 0 rather than deleting the row.
		const l = ledger(roster, [{ player_id: 'a', paid: 0 }], 50);
		expect(l.owing.map((x) => x.name)).toContain('Alice');
	});

	it('counts the money in', () => {
		const l = ledger(
			roster,
			[
				{ player_id: 'a', paid: 1 },
				{ player_id: 'b', paid: 1 }
			],
			50
		);
		expect(l.collected).toBe(100);
	});

	it('keeps roster order within each list, so a name stays where you left it', () => {
		const l = ledger(
			roster,
			[
				{ player_id: 'c', paid: 1 },
				{ player_id: 'a', paid: 1 }
			],
			50
		);
		expect(l.paid.map((x) => x.name)).toEqual(['Alice', 'Carol']);
	});

	it('ignores a payment row for somebody no longer on the roster', () => {
		const l = ledger(roster, [{ player_id: 'ghost', paid: 1 }], 50);
		expect(l.paid).toHaveLength(0);
		expect(l.collected).toBe(0);
	});
});
