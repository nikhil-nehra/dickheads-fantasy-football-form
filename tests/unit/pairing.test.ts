import { describe, it, expect } from 'vitest';
import { autoPair, pairScore, unpaired, pairingProblems } from '../../src/lib/pairing';

describe('auto-pairing from beef rankings', () => {
	it('scores a mutual top pick above a one-sided one', () => {
		const beef = {
			a: ['b', 'c'],
			b: ['a', 'c'],
			c: ['a', 'b']
		};
		expect(pairScore('a', 'b', beef)).toBeGreaterThan(pairScore('b', 'c', beef));
	});

	it('scores an unknown player as zero rather than throwing', () => {
		expect(pairScore('a', 'ghost', { a: ['b'] })).toBe(0);
		expect(pairScore('ghost', 'other', {})).toBe(0);
	});

	it('pairs everyone on an even roster', () => {
		const ids = ['a', 'b', 'c', 'd'];
		const pairs = autoPair(ids, { a: ['b', 'c', 'd'], b: ['a', 'c', 'd'], c: ['d', 'a', 'b'], d: ['c', 'a', 'b'] });
		expect(pairs).toHaveLength(2);
		expect(unpaired(ids, pairs)).toEqual([]);
	});

	it('honours mutual desire', () => {
		const pairs = autoPair(['a', 'b', 'c', 'd'], {
			a: ['b', 'c', 'd'],
			b: ['a', 'c', 'd'],
			c: ['d', 'a', 'b'],
			d: ['c', 'a', 'b']
		});
		const asSets = pairs.map((p) => [...p].sort().join('+'));
		expect(asSets).toContain('a+b');
		expect(asSets).toContain('c+d');
	});

	it('never puts anyone in two pairings', () => {
		const ids = ['a', 'b', 'c', 'd', 'e', 'f'];
		const pairs = autoPair(ids, {});
		const seen = pairs.flat();
		expect(new Set(seen).size).toBe(seen.length);
	});

	// The old auto-pairing re-shuffled as late responses landed, which is why
	// the Desk had to warn against relying on it.
	it('is deterministic for the same input', () => {
		const ids = ['a', 'b', 'c', 'd', 'e', 'f'];
		const beef = { a: ['c', 'b'], b: ['d', 'a'], c: ['a', 'f'] };
		expect(autoPair(ids, beef)).toEqual(autoPair(ids, beef));
	});

	it('leaves exactly one person out on an odd roster', () => {
		const ids = ['a', 'b', 'c', 'd', 'e'];
		const pairs = autoPair(ids, {});
		expect(pairs).toHaveLength(2);
		expect(unpaired(ids, pairs)).toHaveLength(1);
	});

	it('handles an empty roster', () => {
		expect(autoPair([], {})).toEqual([]);
	});
});

describe('pairing problems the Desk should nag about', () => {
	it('is quiet when every player is paired exactly once', () => {
		expect(pairingProblems(['a', 'b', 'c', 'd'], [['a', 'b'], ['c', 'd']])).toEqual([]);
	});

	it('reports anyone left unpaired', () => {
		const problems = pairingProblems(['a', 'b', 'c'], [['a', 'b']]);
		expect(problems.join(' ')).toMatch(/Not paired: c/);
	});

	it('reports a player appearing twice', () => {
		const problems = pairingProblems(['a', 'b', 'c', 'd'], [['a', 'b'], ['a', 'c']]);
		expect(problems.join(' ')).toMatch(/a appears in 2 pairings/);
	});

	it('reports a pairing naming someone off the roster', () => {
		const problems = pairingProblems(['a', 'b'], [['a', 'ghost']]);
		expect(problems.join(' ')).toMatch(/ghost is in a pairing but not on the roster/);
	});

	it('reports someone paired with themselves', () => {
		const problems = pairingProblems(['a', 'b'], [['a', 'a']]);
		expect(problems.join(' ')).toMatch(/paired with themselves/);
	});
});
