import { allQuestions, type Question, type SurveyDefinition } from './types';

/* ═══════════════════════════════════════════════════════════════════════════
   STARTING VALUES
   ═══════════════════════════════════════════════════════════════════════════
   Computed on the SERVER and merged into the loaded answers, so the first
   paint already contains the full ranking ladder and the default prize split.

   Without this the ordered lists would render empty and only fill in once
   hydration ran a client effect — a visible flash, and nothing at all for a
   reader with JavaScript off.
   ═══════════════════════════════════════════════════════════════════════════ */

export type DefaultContext = { playerId: string; rosterIds: string[] };

export function defaultAnswer(q: Question, ctx: DefaultContext): unknown {
	switch (q.type) {
		case 'rank':
			return q.source.kind === 'fixed'
				? q.source.options.map((o) => o.id)
				: ctx.rosterIds.filter((id) => q.source.kind === 'roster' && (q.source.excludeSelf === false || id !== ctx.playerId));

		case 'availability':
			return {
				order: q.windows.map((w) => w.id),
				unavailable: [],
				mode: {}
			};

		case 'allocation': {
			// The templates already total 100, so the carve-out has to be funded
			// OUT of them rather than added on top — otherwise the starting value
			// is 110% and the form opens in an invalid state.
			const buckets = [...(q.templates[q.defaultBuckets] ?? [])];
			let owed = q.carveOut?.default ?? 0;
			while (owed >= q.step) {
				const largest = buckets.indexOf(Math.max(...buckets));
				if (largest < 0 || buckets[largest] < q.step) break;
				buckets[largest] -= q.step;
				owed -= q.step;
			}
			return { buckets, carveOut: (q.carveOut?.default ?? 0) - owed };
		}

		case 'ballot':
			return [];

		case 'multi':
			return { choices: [] };

		// single / text / negotiation start genuinely empty — an unanswered
		// question must stay distinguishable from one answered with a default.
		default:
			return undefined;
	}
}

/** Saved answers win; defaults only fill the gaps. */
export function withDefaults(
	def: SurveyDefinition,
	saved: Record<string, unknown>,
	ctx: DefaultContext
): Record<string, unknown> {
	const out: Record<string, unknown> = { ...saved };
	for (const q of allQuestions(def)) {
		if (out[q.id] !== undefined) continue;
		const d = defaultAnswer(q, ctx);
		if (d !== undefined) out[q.id] = d;
	}
	return out;
}
