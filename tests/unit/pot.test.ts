import { describe, it, expect } from 'vitest';
import { ledger, parsePot, payouts, validatePot } from '../../src/lib/pot';

describe('validatePot', () => {
	it('accepts a buy-in and a split that totals 100', () => {
		const r = validatePot({ buyIn: 50, split: [{ label: '1st', pct: 70 }, { label: '2nd', pct: 30 }] });
		expect(r.ok).toBe(true);
		if (r.ok) expect(r.value.split).toHaveLength(2);
	});

	it('rejects a split that does not total 100', () => {
		// The one error worth being strict about: every figure the board prints
		// is a percentage OF the pot.
		const r = validatePot({ buyIn: 50, split: [{ label: '1st', pct: 60 }, { label: '2nd', pct: 30 }] });
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

	it('rejects a slice with no label or a nonsense percent', () => {
		expect(validatePot({ buyIn: 50, split: [{ label: '  ', pct: 100 }] }).ok).toBe(false);
		expect(validatePot({ buyIn: 50, split: [{ label: '1st', pct: 0 }] }).ok).toBe(false);
		expect(validatePot({ buyIn: 50, split: [{ label: '1st', pct: 101 }] }).ok).toBe(false);
	});

	it('caps the number of slices', () => {
		const many = Array.from({ length: 9 }, (_, i) => ({ label: `p${i}`, pct: 11 }));
		expect(validatePot({ buyIn: 50, split: many }).ok).toBe(false);
	});
});

describe('parsePot', () => {
	it('survives anything hand-edited into the column', () => {
		expect(parsePot(50, 'not json')).toEqual({ buyIn: 50, split: [] });
		expect(parsePot(null, null)).toEqual({ buyIn: 0, split: [] });
		expect(parsePot(50, '{"not":"an array"}')).toEqual({ buyIn: 50, split: [] });
	});

	it('drops slices with no label or no percent', () => {
		const p = parsePot(50, '[{"label":"1st","pct":100},{"label":"","pct":10},{"label":"x","pct":0}]');
		expect(p.split).toEqual([{ label: '1st', pct: 100 }]);
	});
});

describe('payouts', () => {
	it('turns percentages into dollars', () => {
		const cuts = payouts([{ label: '1st', pct: 60 }, { label: '2nd', pct: 40 }], 700);
		expect(cuts.map((c) => c.amount)).toEqual([420, 280]);
	});

	it('always adds up to the pot exactly', () => {
		// 3 x 33% + 1% of $700 rounds per-slice to 231+231+231+7 = 700, where
		// naive independent rounding gives 699.
		const split = [
			{ label: 'a', pct: 33 },
			{ label: 'b', pct: 33 },
			{ label: 'c', pct: 33 },
			{ label: 'd', pct: 1 }
		];
		const cuts = payouts(split, 700);
		expect(cuts.reduce((a, b) => a + b.amount, 0)).toBe(700);
	});

	it('adds up for a lot of awkward pot sizes', () => {
		const split = [
			{ label: 'a', pct: 45 },
			{ label: 'b', pct: 25 },
			{ label: 'c', pct: 15 },
			{ label: 'd', pct: 10 },
			{ label: 'e', pct: 5 }
		];
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
