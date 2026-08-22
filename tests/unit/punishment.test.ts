import { describe, it, expect } from 'vitest';
import {
	DEFAULT_DEADLINE,
	EMPTY_RULING,
	MAX_INSTRUCTIONS,
	SUPER_BOWL_KICKOFF,
	isRuled,
	isStandingDeadline,
	parseRuling
} from '../../src/lib/punishment';

/**
 * The punishment is a ruling, not a tally.
 *
 * There is nothing here that can be invalid — four pieces of free text a
 * commissioner typed — so `parseRuling` normalises rather than validates. What
 * IS worth locking down is the deadline: "by the Super Bowl" is the league's
 * standing rule, not a field somebody has to remember every season.
 */

describe('normalising a ruling', () => {
	it('trims every field', () => {
		const r = parseRuling({
			punishment: '  Crack stud  ',
			victim: ' Last place ',
			deadline: ' Week 18 ',
			instructions: '  Bring a witness.  '
		});
		expect(r).toEqual({
			punishment: 'Crack stud',
			victim: 'Last place',
			deadline: 'Week 18',
			instructions: 'Bring a witness.'
		});
	});

	it('falls back to the standing deadline when one is not given', () => {
		expect(parseRuling({ punishment: 'x' }).deadline).toBe(DEFAULT_DEADLINE);
		expect(parseRuling({ punishment: 'x', deadline: '' }).deadline).toBe(DEFAULT_DEADLINE);
		expect(parseRuling({ punishment: 'x', deadline: '   ' }).deadline).toBe(DEFAULT_DEADLINE);
	});

	it('keeps a deadline somebody actually set', () => {
		expect(parseRuling({ deadline: 'Christmas' }).deadline).toBe('Christmas');
	});

	it('survives junk without throwing — it reaches a public page', () => {
		expect(parseRuling(null)).toEqual(EMPTY_RULING);
		expect(parseRuling(undefined)).toEqual(EMPTY_RULING);
		expect(parseRuling({})).toEqual(EMPTY_RULING);
	});

	it('caps a field rather than rejecting it', () => {
		const long = 'x'.repeat(MAX_INSTRUCTIONS + 500);
		expect(parseRuling({ instructions: long }).instructions).toHaveLength(MAX_INSTRUCTIONS);
	});

	it('keeps the line breaks the instructions were typed with', () => {
		// The board renders these with `pre-wrap`, so a numbered list stays one.
		const typed = '1. Start the clock.\n2. One photo an hour.';
		expect(parseRuling({ instructions: typed }).instructions).toBe(typed);
	});
});

describe('deciding whether there is anything to print', () => {
	it('is the punishment alone that decides it', () => {
		expect(isRuled(EMPTY_RULING)).toBe(false);
		// A deadline with no sentence attached is an empty board, not half a one
		// — and the deadline is never blank, because it defaults.
		expect(isRuled(parseRuling({ deadline: 'The Super Bowl' }))).toBe(false);
		expect(isRuled(parseRuling({ instructions: 'Bring a witness.' }))).toBe(false);
		expect(isRuled(parseRuling({ punishment: 'Crack stud' }))).toBe(true);
	});
});

describe('the deadline', () => {
	/* A timestamp typed by hand is the kind of thing that ships wrong and is
	   only noticed by the person who misses it. Asserted in Eastern, because
	   that is the zone the rule was quoted in: kickoff, 6:30pm ET. */
	const inZone = (ms: number, timeZone: string) =>
		new Intl.DateTimeFormat('en-US', {
			timeZone,
			weekday: 'long',
			year: 'numeric',
			month: 'long',
			day: 'numeric',
			hour: 'numeric',
			minute: '2-digit'
		}).format(new Date(ms));

	it('is kickoff of Super Bowl LXI, 6:30pm Eastern', () => {
		expect(inZone(SUPER_BOWL_KICKOFF, 'America/New_York')).toBe(
			'Sunday, February 14, 2027 at 6:30 PM'
		);
	});

	it('is 5:30pm in Dallas, which is what the board prints', () => {
		expect(inZone(SUPER_BOWL_KICKOFF, 'America/Chicago')).toBe(
			'Sunday, February 14, 2027 at 5:30 PM'
		);
	});

	it('runs a clock only for the deadline it can turn into a moment', () => {
		expect(isStandingDeadline(DEFAULT_DEADLINE)).toBe(true);
		// Forgiving about how it was typed...
		expect(isStandingDeadline('  the super bowl ')).toBe(true);
		// ...but never guessing at one it does not know.
		expect(isStandingDeadline('Week 18')).toBe(false);
		expect(isStandingDeadline('Super Bowl Sunday')).toBe(false);
		expect(isStandingDeadline('')).toBe(false);
	});
});
