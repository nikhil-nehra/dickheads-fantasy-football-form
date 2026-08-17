/* ═══════════════════════════════════════════════════════════════════════════
   VALIDATION — derived from the definition, enforced on the server
   ═══════════════════════════════════════════════════════════════════════════

   The old backend stored whatever string it was handed. Nothing checked the
   shape, nothing checked that the payload's name matched the key it was
   filed under, and anything unparseable silently vanished at render time with
   no signal to anyone.

   Every write now passes through here first, on the server, with the survey's
   own definition as the spec. Client-side checks still exist for the hint
   line under the submit button — but they are a convenience, not the gate.
   ═══════════════════════════════════════════════════════════════════════════ */

import { z } from 'zod';
import {
	allQuestions,
	isVisible,
	showIfPasses,
	type Question,
	type SurveyDefinition,
	type AvailabilityQuestion,
	type AllocationQuestion
} from './types';

export type ValidationContext = {
	/** Who is answering — used to exclude them from roster rankings. */
	playerId: string;
	/** Active roster, in display order. */
	rosterIds: string[];
	/** Valid ballot option ids per question id, read from `ballot_option`. */
	ballotOptions: Record<string, string[]>;
};

export type FieldError = { question: string; message: string };
export type ValidationResult =
	| { ok: true; value: Record<string, unknown> }
	| { ok: false; errors: FieldError[] };

const MAX_TEXT = 2000;

/** Options a roster-ranking question expects from this particular respondent. */
export function rosterTargets(q: Question, ctx: ValidationContext): string[] {
	if (q.type !== 'rank' || q.source.kind !== 'roster') return [];
	return q.source.excludeSelf === false
		? ctx.rosterIds
		: ctx.rosterIds.filter((id) => id !== ctx.playerId);
}

function sameSet(a: string[], b: string[]): boolean {
	if (a.length !== b.length) return false;
	const seen = new Set(b);
	return a.every((x) => seen.has(x)) && new Set(a).size === a.length;
}

function availabilitySchema(q: AvailabilityQuestion) {
	const windowIds = q.windows.map((w) => w.id);
	const slotIds = q.windows.flatMap((w) => w.slots.map((s) => s.id));
	const modeIds = q.mode ? q.mode.options.map((o) => o.id) : [];

	return z
		.object({
			order: z.array(z.string()),
			unavailable: z.array(z.string()).default([]),
			mode: z.record(z.string(), z.string()).default({})
		})
		.refine((v) => sameSet(v.order, windowIds), {
			message: 'Rank every weekend exactly once.',
			path: ['order']
		})
		.refine((v) => v.unavailable.every((s) => slotIds.includes(s)), {
			message: 'Unknown day.',
			path: ['unavailable']
		})
		.refine(
			(v) =>
				Object.entries(v.mode).every(
					([w, m]) => windowIds.includes(w) && modeIds.includes(m)
				),
			{ message: 'Unknown attendance option.', path: ['mode'] }
		);
}

function allocationSchema(q: AllocationQuestion) {
	const base = z.object({
		buckets: z.array(z.number().int().nonnegative()),
		carveOut: z.number().int().nonnegative().default(0)
	});

	const filled = base
		.refine((v) => v.buckets.length >= q.minBuckets && v.buckets.length <= q.maxBuckets, {
			message: `Pick between ${q.minBuckets} and ${q.maxBuckets} places.`,
			path: ['buckets']
		})
		.refine((v) => v.buckets.every((n) => n % q.step === 0) && v.carveOut % q.step === 0, {
			message: `Every share has to be a multiple of ${q.step}%.`,
			path: ['buckets']
		})
		.refine(
			(v) => v.buckets.reduce((a, b) => a + b, 0) + v.carveOut === q.total,
			// The old builder enforced this only in the browser, with a live meter.
			{ message: `The split has to add up to exactly ${q.total}%.`, path: ['buckets'] }
		)
		.refine((v) => (q.carveOut ? true : v.carveOut === 0), {
			message: 'This split has no carve-out.',
			path: ['carveOut']
		});

	return q.allowAbstain
		? z.union([z.object({ abstain: z.literal(true) }), filled])
		: filled;
}

/** The Zod schema for one question's answer value. */
export function schemaFor(q: Question, ctx: ValidationContext): z.ZodType {
	switch (q.type) {
		case 'single': {
			const ids = q.options.map((o) => o.id);
			const allowed = q.writeIn ? [...ids, '__other'] : ids;
			return z
				.object({
					choice: z.string().refine((c) => allowed.includes(c), 'Pick one of the options.'),
					other: z.string().trim().max(q.writeIn?.maxLength ?? 200).optional()
				})
				.refine((v) => v.choice !== '__other' || (v.other && v.other.length > 0), {
					message: 'Type your own answer or pick one of the options.',
					path: ['other']
				});
		}

		case 'multi': {
			const ids = q.options.map((o) => o.id);
			return z
				.object({
					choices: z.array(z.string().refine((c) => ids.includes(c), 'Unknown option')),
					other: z.string().trim().max(200).optional()
				})
				.refine((v) => new Set(v.choices).size === v.choices.length, 'No duplicates.')
				.refine((v) => q.min === undefined || v.choices.length >= q.min, {
					message: `Pick at least ${q.min}.`
				})
				.refine((v) => q.max === undefined || v.choices.length <= q.max, {
					message: `Pick at most ${q.max}.`
				});
		}

		case 'text':
			return z.string().trim().max(q.maxLength ?? MAX_TEXT);

		case 'rank': {
			const targets =
				q.source.kind === 'fixed' ? q.source.options.map((o) => o.id) : rosterTargets(q, ctx);
			return z
				.array(z.string())
				.refine((v) => sameSet(v, targets), 'Rank every option exactly once.');
		}

		case 'availability':
			return availabilitySchema(q);

		case 'allocation':
			return allocationSchema(q);

		case 'ballot': {
			const valid = ctx.ballotOptions[q.id] ?? [];
			return z
				.array(z.string().refine((id) => valid.includes(id), 'Unknown ballot option.'))
				.max(q.podiumSize, `Rank at most ${q.podiumSize}.`)
				.refine((v) => new Set(v).size === v.length, 'No duplicates on the podium.');
		}

		case 'negotiation':
			// Pairwise, so it lives in `negotiation_entry` and never in a response.
			return z.undefined();
	}
}

/** True when an answer counts as "actually filled in" for a required check. */
export function isAnswered(q: Question, v: unknown): boolean {
	if (v === undefined || v === null) return false;
	switch (q.type) {
		case 'single':
			return typeof (v as { choice?: string }).choice === 'string';
		case 'multi':
			return ((v as { choices?: string[] }).choices ?? []).length > 0;
		case 'text':
			return typeof v === 'string' && v.trim().length > 0;
		case 'rank':
			return Array.isArray(v) && v.length > 0;
		case 'availability':
			return Array.isArray((v as { order?: string[] }).order);
		case 'allocation':
			return true;
		case 'ballot':
			return Array.isArray(v) && v.length > 0;
		case 'negotiation':
			return true;
	}
}

/**
 * Validate a whole submission against a survey definition.
 *
 * Visibility is resolved from the raw answers first, so a question hidden by
 * a `showIf` is never treated as required — and any answer submitted for a
 * hidden question is dropped rather than stored.
 */
export function validateResponse(
	def: SurveyDefinition,
	raw: unknown,
	ctx: ValidationContext
): ValidationResult {
	if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
		return { ok: false, errors: [{ question: '_', message: 'Malformed submission.' }] };
	}
	const answers = raw as Record<string, unknown>;
	const errors: FieldError[] = [];
	const value: Record<string, unknown> = {};

	for (const q of allQuestions(def)) {
		if (q.type === 'negotiation') continue;

		if (!isVisible(q, answers)) continue;

		const given = answers[q.id];

		if (given === undefined || given === null) {
			if (q.required) errors.push({ question: q.id, message: 'This one is required.' });
			continue;
		}

		const parsed = schemaFor(q, ctx).safeParse(given);
		if (!parsed.success) {
			errors.push({
				question: q.id,
				message: parsed.error.issues[0]?.message ?? 'That answer is not valid.'
			});
			continue;
		}

		if (q.required && !isAnswered(q, parsed.data)) {
			errors.push({ question: q.id, message: 'This one is required.' });
			continue;
		}

		// Drop sub-answers whose own condition doesn't pass — an in-town player
		// cannot smuggle in-person/virtual choices into the record.
		if (q.type === 'availability' && q.mode && !showIfPasses(q.mode.showIf, answers)) {
			(parsed.data as { mode: Record<string, string> }).mode = {};
		}

		value[q.id] = parsed.data;
	}

	return errors.length ? { ok: false, errors } : { ok: true, value };
}
