import { describe, it, expect } from 'vitest';
import { intake } from '../../src/lib/surveys/intake';
import { rivalry } from '../../src/lib/surveys/rivalry';
import { validateResponse, type ValidationContext } from '../../src/lib/surveys/validate';

const ROSTER = [
	'nikhil-nehra',
	'ryan-latin',
	'lyon-burns',
	'aidan-duncan',
	'stephen-comeaux'
];

const ctx: ValidationContext = {
	playerId: 'nikhil-nehra',
	rosterIds: ROSTER,
	ballotOptions: { podium: ['opt-a', 'opt-b', 'opt-c'] }
};

const others = ROSTER.filter((p) => p !== ctx.playerId);

/** A submission that should always pass, so each test can break one thing. */
function goodIntake(over: Record<string, unknown> = {}) {
	return {
		buyIn: { choice: '50' },
		punishment: 'Loser wears a Cowboys jersey to Thanksgiving',
		locality: { choice: 'local' },
		availability: { order: ['w2', 'w1', 'w3'], unavailable: ['w1fri'], mode: {} },
		beef: [...others],
		prizeSplit: { buckets: [60, 30], carveOut: 10 },
		...over
	};
}

function errorFor(res: ReturnType<typeof validateResponse>, question: string) {
	if (res.ok) return undefined;
	return res.errors.find((e) => e.question === question)?.message;
}

describe('intake validation', () => {
	it('accepts a complete, well-formed submission', () => {
		const res = validateResponse(intake, goodIntake(), ctx);
		expect(res.ok).toBe(true);
	});

	it('rejects a buy-in that is not on the list', () => {
		const res = validateResponse(intake, goodIntake({ buyIn: { choice: '75' } }), ctx);
		expect(res.ok).toBe(false);
		expect(errorFor(res, 'buyIn')).toMatch(/Pick one/);
	});

	it('rejects a prize split that does not total 100', () => {
		const res = validateResponse(
			intake,
			goodIntake({ prizeSplit: { buckets: [60, 30], carveOut: 5 } }),
			ctx
		);
		expect(res.ok).toBe(false);
		expect(errorFor(res, 'prizeSplit')).toMatch(/exactly 100%/);
	});

	it('rejects a prize split that is not in 5% steps', () => {
		const res = validateResponse(
			intake,
			goodIntake({ prizeSplit: { buckets: [63, 27], carveOut: 10 } }),
			ctx
		);
		expect(res.ok).toBe(false);
		expect(errorFor(res, 'prizeSplit')).toMatch(/multiple of 5%/);
	});

	it('accepts abstaining from the optional prize split', () => {
		const res = validateResponse(intake, goodIntake({ prizeSplit: { abstain: true } }), ctx);
		expect(res.ok).toBe(true);
	});

	it('rejects a beef ranking that omits someone', () => {
		const res = validateResponse(intake, goodIntake({ beef: others.slice(1) }), ctx);
		expect(res.ok).toBe(false);
		expect(errorFor(res, 'beef')).toMatch(/every option exactly once/);
	});

	it('rejects a beef ranking that includes yourself', () => {
		const res = validateResponse(intake, goodIntake({ beef: [...ROSTER] }), ctx);
		expect(res.ok).toBe(false);
	});

	it('rejects a beef ranking with a duplicate', () => {
		const dupe = [...others.slice(0, others.length - 1), others[0]];
		const res = validateResponse(intake, goodIntake({ beef: dupe }), ctx);
		expect(res.ok).toBe(false);
	});

	it('rejects a weekend order that is not a permutation', () => {
		const res = validateResponse(
			intake,
			goodIntake({ availability: { order: ['w1', 'w1', 'w3'], unavailable: [], mode: {} } }),
			ctx
		);
		expect(res.ok).toBe(false);
		expect(errorFor(res, 'availability')).toMatch(/every weekend exactly once/);
	});

	it('rejects an unavailable day that does not exist', () => {
		const res = validateResponse(
			intake,
			goodIntake({
				availability: { order: ['w1', 'w2', 'w3'], unavailable: ['w9sat'], mode: {} }
			}),
			ctx
		);
		expect(res.ok).toBe(false);
	});

	it('strips attendance mode for an in-town player', () => {
		// The mode chips are only shown to out-of-towners, so a local submitting
		// them is either a stale client or someone poking at the API.
		const res = validateResponse(
			intake,
			goodIntake({
				locality: { choice: 'local' },
				availability: {
					order: ['w1', 'w2', 'w3'],
					unavailable: [],
					mode: { w1: 'in-person' }
				}
			}),
			ctx
		);
		expect(res.ok).toBe(true);
		if (res.ok) expect((res.value.availability as { mode: object }).mode).toEqual({});
	});

	it('keeps attendance mode for an out-of-town player', () => {
		const res = validateResponse(
			intake,
			goodIntake({
				locality: { choice: 'oot' },
				availability: {
					order: ['w1', 'w2', 'w3'],
					unavailable: [],
					mode: { w1: 'virtual' }
				}
			}),
			ctx
		);
		expect(res.ok).toBe(true);
		if (res.ok)
			expect((res.value.availability as { mode: object }).mode).toEqual({ w1: 'virtual' });
	});

	it('does not require a question hidden by its condition', () => {
		// With locality unanswered the availability grid is not shown, so its
		// `required` must not fire. The old form had no conditionals at all.
		const res = validateResponse(
			intake,
			{
				buyIn: { choice: '25' },
				punishment: 'something',
				beef: [...others]
			},
			ctx
		);
		expect(res.ok).toBe(false);
		expect(errorFor(res, 'availability')).toBeUndefined();
		expect(errorFor(res, 'locality')).toMatch(/required/);
	});

	it('drops answers to questions that are not in the definition', () => {
		const res = validateResponse(intake, goodIntake({ smuggled: 'nope' }), ctx);
		expect(res.ok).toBe(true);
		if (res.ok) expect(res.value).not.toHaveProperty('smuggled');
	});

	it('rejects a malformed submission outright', () => {
		expect(validateResponse(intake, 'not an object', ctx).ok).toBe(false);
		expect(validateResponse(intake, null, ctx).ok).toBe(false);
		expect(validateResponse(intake, [], ctx).ok).toBe(false);
	});
});

describe('rivalry validation', () => {
	const goodRivalry = (over: Record<string, unknown> = {}) => ({
		podium: ['opt-b', 'opt-a', 'opt-c'],
		target: { choice: 'reg-last' },
		...over
	});

	it('accepts a valid ballot and victim vote', () => {
		expect(validateResponse(rivalry, goodRivalry(), ctx).ok).toBe(true);
	});

	it('rejects a podium with slots left empty', () => {
		// "Rank your top 3" on a 3/2/1 scale is not "rank up to 3": a short
		// podium is a quieter vote, and the person casting it cannot tell.
		const res = validateResponse(rivalry, goodRivalry({ podium: ['opt-b', 'opt-a'] }), ctx);
		expect(res.ok).toBe(false);
		expect(errorFor(res, 'podium')).toMatch(/all 3/i);
	});

	it('caps the required podium at the size of the pool', () => {
		// A ballot holding two options cannot be ranked three deep, and a survey
		// nobody can submit is worse than a podium with a gap in it.
		const thin: ValidationContext = { ...ctx, ballotOptions: { podium: ['opt-a', 'opt-b'] } };
		expect(validateResponse(rivalry, goodRivalry({ podium: ['opt-a', 'opt-b'] }), thin).ok).toBe(
			true
		);
		expect(validateResponse(rivalry, goodRivalry({ podium: ['opt-a'] }), thin).ok).toBe(false);
	});

	it('rejects a podium longer than the podium size', () => {
		const res = validateResponse(
			rivalry,
			goodRivalry({ podium: ['opt-a', 'opt-b', 'opt-c', 'opt-a'] }),
			ctx
		);
		expect(res.ok).toBe(false);
	});

	it('rejects a podium with duplicates', () => {
		const res = validateResponse(rivalry, goodRivalry({ podium: ['opt-a', 'opt-a'] }), ctx);
		expect(res.ok).toBe(false);
		expect(errorFor(res, 'podium')).toMatch(/duplicates/i);
	});

	it('rejects a ballot option that is not in the pool', () => {
		// Option ids are stable database rows, so an unknown id is always a forgery.
		const res = validateResponse(rivalry, goodRivalry({ podium: ['opt-zzz'] }), ctx);
		expect(res.ok).toBe(false);
	});

	it('requires the write-in text when "something else" is chosen', () => {
		const res = validateResponse(rivalry, goodRivalry({ target: { choice: '__other' } }), ctx);
		expect(res.ok).toBe(false);
		expect(errorFor(res, 'target')).toMatch(/Type your own answer/);
	});

	it('accepts "something else" with text', () => {
		const res = validateResponse(
			rivalry,
			goodRivalry({ target: { choice: '__other', other: 'The commissioner, obviously' } }),
			ctx
		);
		expect(res.ok).toBe(true);
	});

	it('never stores the negotiation question in a response', () => {
		const res = validateResponse(rivalry, goodRivalry({ negotiation: { rname: 'x' } }), ctx);
		expect(res.ok).toBe(true);
		// Negotiation is pairwise and lives in its own table.
		if (res.ok) expect(res.value).not.toHaveProperty('negotiation');
	});
});
