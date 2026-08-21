import { describe, it, expect } from 'vitest';
import {
	CHALLENGE_CLOSES,
	CHALLENGE_RUNS,
	countdown,
	daysOut,
	draftOrder,
	formatClock,
	leagueTime,
	parseClock
} from '../../src/lib/draft';

const ROSTER = [
	{ id: 'nikhil-nehra', display_name: 'Nikhil Nehra' },
	{ id: 'ryan-latin', display_name: 'Ryan Latin' },
	{ id: 'aidan-duncan', display_name: 'Aidan Duncan' },
	{ id: 'stephen-comeaux', display_name: 'Stephen Comeaux' },
	{ id: 'jaswin-jabbal', display_name: 'Jaswin Jabbal' },
	{ id: 'sean-vargeese', display_name: 'Sean Vargeese' },
	{ id: 'matthew-yoshida', display_name: 'Matthew Yoshida' },
	{ id: 'rayyan-ali', display_name: 'Rayyan Ali' }
];

describe('parseClock', () => {
	it('reads m:ss.hh off the stopwatch', () => {
		expect(parseClock('0:36.00')).toBe(3600);
		expect(parseClock('1:32.64')).toBe(9264);
		expect(parseClock('9:28.34')).toBe(56834);
	});

	it('reads an hour-long effort too', () => {
		expect(parseClock('1:00:00.00')).toBe(360000);
	});

	it('rejects anything it does not understand rather than guessing', () => {
		// A bad row must drop out of the order, not sort to the front as zero.
		expect(parseClock('36')).toBeNull();
		expect(parseClock('0:75.00')).toBeNull();
		expect(parseClock('nope')).toBeNull();
		expect(parseClock('-1:00.00')).toBeNull();
		expect(parseClock('1:2:3:4.00')).toBeNull();
	});

	it('round-trips through formatClock', () => {
		for (const run of CHALLENGE_RUNS) {
			expect(formatClock(parseClock(run.clock)!)).toBe(run.clock);
		}
	});
});

describe('draftOrder', () => {
	const order = draftOrder(ROSTER);

	it('gives first pick to the fastest burger', () => {
		expect(order.picks[0]).toMatchObject({ pick: 1, name: 'Rayyan Ali', clock: '0:36.00' });
	});

	it('runs strictly fastest to slowest', () => {
		expect(order.picks.map((p) => p.name)).toEqual([
			'Rayyan Ali',
			'Nikhil Nehra',
			'Sean Vargeese',
			'Jaswin Jabbal',
			'Stephen Comeaux',
			'Matthew Yoshida',
			'Aidan Duncan'
		]);
		expect(order.picks.map((p) => p.pick)).toEqual([1, 2, 3, 4, 5, 6, 7]);
	});

	it('leaves everyone who has not eaten unseeded, in roster order', () => {
		expect(order.pending.map((p) => p.display_name)).toEqual(['Ryan Latin']);
	});

	it('measures each bar against the slowest finished run', () => {
		expect(order.picks[order.picks.length - 1].pct).toBe(100);
		// 0:36.00 against Aidan's 9:28.34.
		expect(order.picks[0].pct).toBe(6);
	});

	it('keeps a runaway winner’s bar visible rather than zero-width', () => {
		const blowout = draftOrder(ROSTER, [
			{ playerId: 'rayyan-ali', clock: '0:01.00' },
			{ playerId: 'aidan-duncan', clock: '9:59.00' }
		]);
		expect(blowout.picks[0].pct).toBe(3);
	});

	it('breaks a dead heat on roster order', () => {
		const tied = draftOrder(ROSTER, [
			{ playerId: 'ryan-latin', clock: '1:00.00' },
			{ playerId: 'nikhil-nehra', clock: '1:00.00' }
		]);
		expect(tied.picks.map((p) => p.name)).toEqual(['Nikhil Nehra', 'Ryan Latin']);
	});

	it('shows an unknown player id rather than swallowing the typo', () => {
		const typo = draftOrder(ROSTER, [{ playerId: 'ryan-lattin', clock: '1:00.00' }]);
		expect(typo.picks[0].name).toBe('ryan-lattin');
		// …and that player is still counted as owing the league a burger.
		expect(typo.pending.map((p) => p.id)).toContain('ryan-latin');
	});

	it('drops a row it cannot parse instead of seeding it first', () => {
		const bad = draftOrder(ROSTER, [
			{ playerId: 'ryan-latin', clock: 'ate it, forgot to time it' },
			{ playerId: 'nikhil-nehra', clock: '2:00.00' }
		]);
		expect(bad.picks.map((p) => p.name)).toEqual(['Nikhil Nehra']);
	});

	it('collapses a second attempt to the faster one', () => {
		const twice = draftOrder(ROSTER, [
			{ playerId: 'ryan-latin', clock: '4:00.00' },
			{ playerId: 'ryan-latin', clock: '2:00.00' },
			{ playerId: 'nikhil-nehra', clock: '3:00.00' }
		]);
		expect(twice.picks.map((p) => [p.name, p.clock])).toEqual([
			['Ryan Latin', '2:00.00'],
			['Nikhil Nehra', '3:00.00']
		]);
		// Ids stay unique — the board keys its list on them.
		expect(new Set(twice.picks.map((p) => p.playerId)).size).toBe(twice.picks.length);
	});

	it('has no picks and no bars before anyone eats', () => {
		const cold = draftOrder(ROSTER, []);
		expect(cold.picks).toEqual([]);
		expect(cold.pending).toHaveLength(ROSTER.length);
	});
});

describe('countdown', () => {
	const day = 86_400_000;

	it('breaks the remainder into days, hours, minutes and seconds', () => {
		const c = countdown(0, 2 * day + 3 * 3_600_000 + 4 * 60_000 + 5_000);
		expect(c).toMatchObject({ days: 2, hours: 3, minutes: 4, seconds: 5, done: false });
	});

	it('floors at zero once the moment has passed', () => {
		const c = countdown(1000, 0);
		expect(c).toMatchObject({ left: 0, days: 0, hours: 0, minutes: 0, seconds: 0, done: true });
	});

	it('counts the exact moment as done', () => {
		expect(countdown(500, 500).done).toBe(true);
	});
});

describe('daysOut', () => {
	it('rounds a part-day up, so "1 day out" never means "tonight"', () => {
		expect(daysOut(0, 86_400_000 + 1)).toBe(2);
		expect(daysOut(0, 86_400_000)).toBe(1);
		expect(daysOut(0, -5)).toBe(0);
	});
});

describe('the burger deadline', () => {
	it('lands at midnight at the end of Aug 31, Dallas time', () => {
		// Rendered as the minute before, which is how the board labels it.
		expect(leagueTime(CHALLENGE_CLOSES - 60_000)).toContain('Aug 31');
		expect(leagueTime(CHALLENGE_CLOSES - 60_000)).toContain('11:59');
		expect(leagueTime(CHALLENGE_CLOSES)).toContain('Sep 1');
	});
});

describe('leagueTime', () => {
	it('reads in Central regardless of where the reader is', () => {
		// Sleeper's 2026 draft slot: 01:00 UTC on Sep 7 is 8pm on Sep 6 in Dallas.
		expect(leagueTime(Date.parse('2026-09-07T01:00:00Z'))).toBe('Sun, Sep 6, 8:00 PM CDT');
	});
});
