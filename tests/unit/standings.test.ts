import { describe, it, expect } from 'vitest';
import {
	atRisk,
	played,
	recordOf,
	seasonStarted,
	winRate,
	worstFirst
} from '../../src/lib/standings';

/**
 * One definition of "worst", used by the victim resolver, the Standings board
 * and The Punishment board. It decides who spends a day in an IHOP, so it is
 * worth pinning rather than re-deriving in three places and hoping.
 */

const team = (name: string, wins: number, losses: number, ties = 0, pointsFor = 1000) => ({
	displayName: name,
	wins,
	losses,
	ties,
	pointsFor
});

describe('ranking the bottom of the table', () => {
	it('counts a tie as half a win', () => {
		// The inline sorts this replaced compared raw wins, which called these
		// the same record. They are not: 3-9-1 has the better season.
		const rows = [team('Ties', 3, 9, 1), team('NoTies', 3, 10, 0)];
		expect(worstFirst(rows).map((r) => r.displayName)).toEqual(['NoTies', 'Ties']);
		expect(winRate(rows[0])).toBeGreaterThan(winRate(rows[1]));
	});

	it('breaks a genuine tie on fewest points scored', () => {
		// Being bad, not being unlucky — so points FOR, never points against.
		const rows = [team('Lucky', 4, 9, 0, 1300), team('Feeble', 4, 9, 0, 1100)];
		expect(worstFirst(rows)[0].displayName).toBe('Feeble');
	});

	it('puts the worst record first', () => {
		const rows = [team('Good', 9, 4), team('Bad', 2, 11), team('Mid', 6, 7)];
		expect(worstFirst(rows).map((r) => r.displayName)).toEqual(['Bad', 'Mid', 'Good']);
	});

	it('does not mutate what it was given', () => {
		const rows = [team('A', 9, 4), team('B', 2, 11)];
		worstFirst(rows);
		expect(rows[0].displayName).toBe('A');
	});
});

describe('naming names', () => {
	const preseason = [team('A', 0, 0), team('B', 0, 0), team('C', 0, 0)];

	it('names nobody before a game has been played', () => {
		/* In August every row is 0-0-0 with no points. Sorting that returns
		   somebody, and printing them on a public board would accuse whoever
		   happens to come first of losing a season nobody has played. */
		expect(seasonStarted(preseason)).toBe(false);
		expect(atRisk(preseason)).toEqual([]);
	});

	it('starts naming them the moment one game is in', () => {
		const rows = [team('A', 1, 0), team('B', 0, 1), team('C', 0, 0)];
		expect(seasonStarted(rows)).toBe(true);
		expect(atRisk(rows, 1).map((r) => r.displayName)).toEqual(['B']);
	});

	it('counts a tie as a game played', () => {
		expect(played(team('A', 0, 0, 1))).toBe(1);
		expect(seasonStarted([team('A', 0, 0, 1)])).toBe(true);
	});

	it('takes the bottom three, worst first', () => {
		const rows = [
			team('1st', 9, 4),
			team('Last', 2, 11),
			team('Mid', 6, 7),
			team('4th', 7, 6),
			team('2ndLast', 3, 10)
		];
		expect(atRisk(rows).map((r) => r.displayName)).toEqual(['Last', '2ndLast', 'Mid']);
	});

	it('copes with a league smaller than the list', () => {
		expect(atRisk([team('Only', 0, 1)])).toHaveLength(1);
		expect(atRisk([])).toEqual([]);
	});
});

describe('writing a record down', () => {
	it('leaves ties out when there are none', () => {
		expect(recordOf(team('A', 9, 4))).toBe('9-4');
	});

	it('includes them when there are', () => {
		expect(recordOf(team('A', 3, 9, 1))).toBe('3-9-1');
	});
});
