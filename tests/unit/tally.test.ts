import { describe, it, expect } from 'vitest';
import { intake } from '../../src/lib/surveys/intake';
import { rivalry } from '../../src/lib/surveys/rivalry';
import { questionById } from '../../src/lib/surveys/types';
import {
	singleTally,
	multiTally,
	rankTally,
	ballotTally,
	textQuotes,
	availabilityStats,
	bestSlot,
	allocationAverage,
	missing,
	type Submission
} from '../../src/lib/tally';
import type {
	AllocationQuestion,
	AvailabilityQuestion,
	BallotQuestion,
	MultiQuestion,
	RankQuestion,
	SingleQuestion
} from '../../src/lib/surveys/types';

const buyIn = questionById(intake, 'buyIn') as SingleQuestion;
const availability = questionById(intake, 'availability') as AvailabilityQuestion;
const prize = questionById(intake, 'prizeSplit') as AllocationQuestion;
const podium = questionById(rivalry, 'podium') as BallotQuestion;
const target = questionById(rivalry, 'target') as SingleQuestion;
const beef = questionById(intake, 'beef') as RankQuestion;

/* No survey ships a multi-select yet, so the type's tally is exercised against
   a definition written here. It is the registry's job to decide what the
   league is asked; it is this file's job to make sure a new question type is
   summarised the moment somebody asks it. */
const sides: MultiQuestion = {
	id: 'sides',
	type: 'multi',
	prompt: 'Which of these are you in for?',
	options: [
		{ id: 'chili', label: 'Chili cook-off' },
		{ id: 'jersey', label: 'Jersey week' },
		{ id: 'burger', label: 'Burger challenge' }
	]
};

const sub = (playerId: string, answers: Record<string, unknown>): Submission => ({
	playerId,
	playerName: playerId,
	answers
});

describe('single-choice tallies', () => {
	it('counts votes and ranks them', () => {
		const rows = singleTally(buyIn, [
			sub('a', { buyIn: { choice: '50' } }),
			sub('b', { buyIn: { choice: '50' } }),
			sub('c', { buyIn: { choice: '25' } })
		]);
		expect(rows[0]).toMatchObject({ id: '50', n: 2, pct: 67 });
		expect(rows[1]).toMatchObject({ id: '25', n: 1, pct: 33 });
	});

	it('skips people who did not answer', () => {
		const rows = singleTally(buyIn, [sub('a', { buyIn: { choice: '25' } }), sub('b', {})]);
		expect(rows[0].pct).toBe(100);
	});

	it('folds write-ins that differ only in case or spacing into one vote', () => {
		const rows = singleTally(target, [
			sub('a', { target: { choice: '__other', other: 'The commissioner' } }),
			sub('b', { target: { choice: '__other', other: 'the  COMMISSIONER' } }),
			sub('c', { target: { choice: 'reg-last' } })
		]);
		const writeIn = rows.filter((r) => r.id.startsWith('other:'));
		expect(writeIn).toHaveLength(1);
		expect(writeIn[0].n).toBe(2);
		// The first spelling seen is the one shown.
		expect(writeIn[0].label).toBe('The commissioner');
	});

	it('keeps genuinely different write-ins apart', () => {
		const rows = singleTally(target, [
			sub('a', { target: { choice: '__other', other: 'The commissioner' } }),
			sub('b', { target: { choice: '__other', other: 'Whoever drafts a kicker first' } })
		]);
		expect(rows.filter((r) => r.id.startsWith('other:'))).toHaveLength(2);
	});

	it('ignores a write-in with no text', () => {
		const rows = singleTally(target, [sub('a', { target: { choice: '__other', other: '  ' } })]);
		expect(rows).toEqual([]);
	});

	it('returns nothing for no submissions', () => {
		expect(singleTally(buyIn, [])).toEqual([]);
	});
});

describe('multi-select tallies', () => {
	it('counts a tick per option', () => {
		const rows = multiTally(sides, [
			sub('a', { sides: { choices: ['chili', 'jersey'] } }),
			sub('b', { sides: { choices: ['chili'] } })
		]);
		expect(rows[0]).toMatchObject({ id: 'chili', n: 2, pct: 100 });
		expect(rows[1]).toMatchObject({ id: 'jersey', n: 1, pct: 50 });
	});

	// Share of PEOPLE, not of ticks: everyone ticking everything is unanimity
	// on all three, not 33% each.
	it('reads percentages as a share of the people who answered', () => {
		const all = ['chili', 'jersey', 'burger'];
		const rows = multiTally(sides, [
			sub('a', { sides: { choices: all } }),
			sub('b', { sides: { choices: all } })
		]);
		expect(rows.every((r) => r.pct === 100)).toBe(true);
	});

	it('does not let a duplicated choice vote twice', () => {
		const rows = multiTally(sides, [sub('a', { sides: { choices: ['chili', 'chili'] } })]);
		expect(rows[0].n).toBe(1);
	});

	it('skips empty and malformed answers', () => {
		const rows = multiTally(sides, [
			sub('a', { sides: { choices: [] } }),
			sub('b', { sides: 'nope' }),
			sub('c', {}),
			sub('d', { sides: { choices: ['burger'] } })
		]);
		expect(rows).toHaveLength(1);
		expect(rows[0]).toMatchObject({ id: 'burger', n: 1, pct: 100 });
	});
});

describe('ranked ladders', () => {
	const names = new Map([
		['a', 'Ada'],
		['b', 'Bo'],
		['c', 'Cy'],
		['d', 'Dee']
	]);

	it('scores a ladder by Borda position', () => {
		// A list of three: 3 points for the top, then 2, then 1.
		const rows = rankTally(beef, [sub('a', { beef: ['b', 'c', 'd'] })], names);
		expect(rows.map((r) => [r.id, r.points])).toEqual([
			['b', 3],
			['c', 2],
			['d', 1]
		]);
	});

	it('scores the bottom rung of any ladder at 1', () => {
		const rows = rankTally(beef, [sub('a', { beef: ['b', 'c', 'd'] })], names);
		expect(rows.at(-1)!.points).toBe(1);
	});

	/* Roster ladders are all the same length in practice — `excludeSelf` takes
	   exactly one name off each — so this is a straight vote. A partial ladder
	   still adds up; it just hands out fewer points, which is what a Borda
	   count does with a short ballot. */
	it('sums across ladders of different lengths', () => {
		const rows = rankTally(
			beef,
			[sub('a', { beef: ['b'] }), sub('c', { beef: ['d', 'b', 'a'] })],
			names
		);
		// Bo: 1 (top of one) + 2 (second of three). Dee: 3 (top of three).
		expect(rows.find((r) => r.id === 'b')!.points).toBe(3);
		expect(rows.find((r) => r.id === 'd')!.points).toBe(3);
		expect(rows.find((r) => r.id === 'a')!.points).toBe(1);
	});

	it('reports average finishing position among the people who ranked them', () => {
		const rows = rankTally(
			beef,
			[sub('a', { beef: ['b', 'c'] }), sub('d', { beef: ['c', 'b'] })],
			names
		);
		// Both were ranked 1st once and 2nd once.
		expect(rows.every((r) => r.avg === 1.5)).toBe(true);
		expect(rows.every((r) => r.n === 2)).toBe(true);
	});

	it('breaks ties on first-place placements', () => {
		const rows = rankTally(
			beef,
			[sub('a', { beef: ['b', 'c'] }), sub('d', { beef: ['c', 'b'] })],
			names
		);
		expect(rows[0].firsts).toBe(1);
		expect(rows).toHaveLength(2);
	});

	it('names roster ids and falls back to the id when nobody claims it', () => {
		const rows = rankTally(beef, [sub('a', { beef: ['b', 'ghost'] })], names);
		expect(rows[0].label).toBe('Bo');
		expect(rows[1].label).toBe('ghost');
	});

	it('ignores a malformed or empty ladder', () => {
		expect(rankTally(beef, [sub('a', { beef: 'nope' }), sub('b', { beef: [] })], names)).toEqual(
			[]
		);
	});
});

describe('ranked-choice ballot', () => {
	const text = new Map([
		['o1', 'Shave your head'],
		['o2', 'Wear a jersey'],
		['o3', 'Tattoo']
	]);

	it('awards 3/2/1 by position', () => {
		const rows = ballotTally(podium, [sub('a', { podium: ['o1', 'o2', 'o3'] })], text);
		expect(rows.find((r) => r.id === 'o1')!.points).toBe(3);
		expect(rows.find((r) => r.id === 'o2')!.points).toBe(2);
		expect(rows.find((r) => r.id === 'o3')!.points).toBe(1);
	});

	it('ranks by total points', () => {
		const rows = ballotTally(
			podium,
			[sub('a', { podium: ['o1', 'o2'] }), sub('b', { podium: ['o2', 'o1'] }), sub('c', { podium: ['o2'] })],
			text
		);
		expect(rows[0].id).toBe('o2');
	});

	it('breaks ties on first-place votes', () => {
		// o1: 3+1 = 4 with one first. o2: 2+2 = 4 with no firsts.
		const rows = ballotTally(
			podium,
			[sub('a', { podium: ['o1', 'o2'] }), sub('b', { podium: ['o3', 'o2', 'o1'] })],
			text
		);
		const tied = rows.filter((r) => r.points === 4);
		expect(tied[0].id).toBe('o1');
	});

	it('labels an option whose row has gone as removed', () => {
		const rows = ballotTally(podium, [sub('a', { podium: ['gone'] })], text);
		expect(rows[0].label).toBe('(removed option)');
	});

	it('ignores a malformed podium', () => {
		expect(ballotTally(podium, [sub('a', { podium: 'nope' })], text)).toEqual([]);
	});
});

describe('draft availability', () => {
	const full = (order: string[], unavailable: string[] = [], mode = {}) =>
		({ availability: { order, unavailable, mode } });

	it('ranks weekends by aggregate preference', () => {
		const stats = availabilityStats(availability, [
			sub('a', full(['w2', 'w1', 'w3'])),
			sub('b', full(['w2', 'w3', 'w1']))
		]);
		expect(stats[0].id).toBe('w2');
	});

	it('counts who is free on each day and names who is out', () => {
		const stats = availabilityStats(availability, [
			sub('a', full(['w1', 'w2', 'w3'], ['w1fri'])),
			sub('b', full(['w1', 'w2', 'w3']))
		]);
		const w1 = stats.find((w) => w.id === 'w1')!;
		expect(w1.slots.find((s) => s.id === 'w1fri')!.available).toBe(1);
		expect(w1.slots.find((s) => s.id === 'w1fri')!.out).toEqual(['a']);
		expect(w1.slots.find((s) => s.id === 'w1sat')!.available).toBe(2);
	});

	it('counts fully-free people per weekend', () => {
		const stats = availabilityStats(availability, [
			sub('a', full(['w1', 'w2', 'w3'], ['w1fri'])),
			sub('b', full(['w1', 'w2', 'w3']))
		]);
		expect(stats.find((w) => w.id === 'w1')!.fullyAvailable).toBe(1);
	});

	it('splits in-person from virtual', () => {
		const stats = availabilityStats(availability, [
			sub('a', full(['w1', 'w2', 'w3'], [], { w1: 'in-person' })),
			sub('b', full(['w1', 'w2', 'w3'], [], { w1: 'virtual' }))
		]);
		const w1 = stats.find((w) => w.id === 'w1')!;
		expect(w1.inPerson).toEqual(['a']);
		expect(w1.virtual).toEqual(['b']);
	});

	it('finds the single best date', () => {
		const best = bestSlot(availability, [
			sub('a', full(['w1', 'w2', 'w3'], ['w1fri', 'w1sat'])),
			sub('b', full(['w1', 'w2', 'w3'], ['w1fri']))
		]);
		expect(best!.available).toBe(2);
		expect(best!.id).not.toBe('w1fri');
	});

	it('ignores submissions with no availability answer', () => {
		const stats = availabilityStats(availability, [sub('a', {})]);
		expect(stats.every((w) => w.preference === 0)).toBe(true);
	});
});

describe('prize split averaging', () => {
	it('averages and always totals exactly 100', () => {
		const avg = allocationAverage(prize, [
			sub('a', { prizeSplit: { buckets: [60, 30], carveOut: 10 } }),
			sub('b', { prizeSplit: { buckets: [50, 30], carveOut: 20 } })
		]);
		const total = avg.buckets.reduce((s, b) => s + b.pct, 0) + (avg.carveOut?.pct ?? 0);
		expect(total).toBe(100);
	});

	it('counts abstentions separately from respondents', () => {
		const avg = allocationAverage(prize, [
			sub('a', { prizeSplit: { buckets: [60, 30], carveOut: 10 } }),
			sub('b', { prizeSplit: { abstain: true } })
		]);
		expect(avg.respondents).toBe(1);
		expect(avg.abstained).toBe(1);
	});

	it('handles nobody having a preference', () => {
		const avg = allocationAverage(prize, [sub('a', { prizeSplit: { abstain: true } })]);
		expect(avg.respondents).toBe(0);
		expect(avg.buckets).toEqual([]);
	});

	// Averaging splits of different lengths must not lose the deeper places.
	it('accommodates different numbers of paid places', () => {
		const avg = allocationAverage(prize, [
			sub('a', { prizeSplit: { buckets: [100], carveOut: 0 } }),
			sub('b', { prizeSplit: { buckets: [40, 30, 20, 10], carveOut: 0 } })
		]);
		const total = avg.buckets.reduce((s, b) => s + b.pct, 0) + (avg.carveOut?.pct ?? 0);
		expect(total).toBe(100);
		expect(avg.buckets.length).toBeGreaterThan(1);
	});
});

describe('quotes and turnout', () => {
	it('collects free-text answers with attribution', () => {
		const q = questionById(intake, 'punishment')!;
		const quotes = textQuotes(q, [sub('a', { punishment: 'Shave it' }), sub('b', { punishment: '  ' })]);
		expect(quotes).toEqual([{ by: 'a', text: 'Shave it' }]);
	});

	it('lists who has not answered', () => {
		const roster = [
			{ id: 'a', display_name: 'Ada' },
			{ id: 'b', display_name: 'Bo' }
		];
		expect(missing(roster, [sub('a', {})])).toEqual(['Bo']);
	});
});
