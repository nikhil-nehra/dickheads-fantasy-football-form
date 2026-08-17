import { norm } from './text';
import type {
	AllocationQuestion,
	AvailabilityQuestion,
	BallotQuestion,
	Question,
	SingleQuestion
} from './surveys/types';

/* ═══════════════════════════════════════════════════════════════════════════
   AGGREGATION
   ═══════════════════════════════════════════════════════════════════════════
   Pure functions over an array of submitted answers, driven by question TYPE
   rather than by question id — so a new single-choice question gets a tally
   for free, on the Desk and on the boards, with no new code.

   All of this was previously spread across buyInTally, prizeAggregate,
   weekendStats, bestDraftDay, punishmentTally and targetTally, each hardcoded
   to one specific question, each recomputed on every render, and none of it
   reachable from a unit test because it lived in globals inside page scripts.
   ═══════════════════════════════════════════════════════════════════════════ */

export type Submission = { playerId: string; playerName: string; answers: Record<string, unknown> };

export type Count = { id: string; label: string; n: number; pct: number };

function pct(n: number, total: number): number {
	return total ? Math.round((n / total) * 100) : 0;
}

/** Votes per option for a single-choice question, write-ins included. */
export function singleTally(q: SingleQuestion, subs: Submission[]): Count[] {
	const counts = new Map<string, number>();
	const labels = new Map<string, string>(q.options.map((o) => [o.id, o.label]));
	let total = 0;

	for (const s of subs) {
		const v = s.answers[q.id] as { choice?: string; other?: string } | undefined;
		if (!v?.choice) continue;
		total++;
		if (v.choice === '__other') {
			const text = (v.other ?? '').trim();
			if (!text) continue;
			// Same normalisation the ballot and the agreement check use, so
			// "The commissioner" and "the  COMMISSIONER" are one vote, not two.
			const key = `other:${norm(text)}`;
			labels.set(key, labels.get(key) ?? text);
			counts.set(key, (counts.get(key) ?? 0) + 1);
		} else {
			counts.set(v.choice, (counts.get(v.choice) ?? 0) + 1);
		}
	}

	return [...counts.entries()]
		.map(([id, n]) => ({ id, label: labels.get(id) ?? id, n, pct: pct(n, total) }))
		.sort((a, b) => b.n - a.n || a.label.localeCompare(b.label));
}

export type BallotResult = Count & { firsts: number; points: number };

/**
 * Ranked-choice tally: 1st is worth points[0], 2nd points[1], and so on.
 * Ties break on number of first-place votes, exactly as before.
 */
export function ballotTally(
	q: BallotQuestion,
	subs: Submission[],
	optionText: Map<string, string>
): BallotResult[] {
	const points = new Map<string, number>();
	const firsts = new Map<string, number>();
	const mentions = new Map<string, number>();

	for (const s of subs) {
		const podium = s.answers[q.id];
		if (!Array.isArray(podium)) continue;
		podium.forEach((id: string, i: number) => {
			points.set(id, (points.get(id) ?? 0) + (q.points[i] ?? 0));
			mentions.set(id, (mentions.get(id) ?? 0) + 1);
			if (i === 0) firsts.set(id, (firsts.get(id) ?? 0) + 1);
		});
	}

	const maxPoints = Math.max(1, ...points.values());

	return [...points.entries()]
		.map(([id, p]) => ({
			id,
			label: optionText.get(id) ?? '(removed option)',
			n: mentions.get(id) ?? 0,
			pct: pct(p, maxPoints),
			firsts: firsts.get(id) ?? 0,
			points: p
		}))
		.sort((a, b) => b.points - a.points || b.firsts - a.firsts || a.label.localeCompare(b.label));
}

/** Every free-text answer, with who said it. */
export function textQuotes(q: Question, subs: Submission[]): { by: string; text: string }[] {
	return subs
		.map((s) => ({ by: s.playerName, text: String(s.answers[q.id] ?? '').trim() }))
		.filter((x) => x.text.length > 0);
}

export type SlotStat = { id: string; label: string; available: number; out: string[] };
export type WindowStat = {
	id: string;
	label: string;
	/** Sum of (n - position) across respondents: higher means preferred. */
	preference: number;
	/** People with no conflict anywhere in this window. */
	fullyAvailable: number;
	inPerson: string[];
	virtual: string[];
	slots: SlotStat[];
};

export function availabilityStats(q: AvailabilityQuestion, subs: Submission[]): WindowStat[] {
	const n = q.windows.length;

	return q.windows
		.map((w) => {
			let preference = 0;
			let fullyAvailable = 0;
			const inPerson: string[] = [];
			const virtual: string[] = [];

			const slots: SlotStat[] = w.slots.map((sl) => ({
				id: sl.id,
				label: sl.label,
				available: 0,
				out: []
			}));

			for (const s of subs) {
				const v = s.answers[q.id] as
					| { order?: string[]; unavailable?: string[]; mode?: Record<string, string> }
					| undefined;
				if (!v?.order) continue;

				const pos = v.order.indexOf(w.id);
				if (pos >= 0) preference += n - pos;

				const out = new Set(v.unavailable ?? []);
				let anyConflict = false;

				for (const sl of slots) {
					if (out.has(sl.id)) {
						sl.out.push(s.playerName);
						anyConflict = true;
					} else {
						sl.available++;
					}
				}

				if (!anyConflict) fullyAvailable++;

				const mode = v.mode?.[w.id];
				if (mode === 'in-person') inPerson.push(s.playerName);
				else if (mode === 'virtual') virtual.push(s.playerName);
			}

			return { id: w.id, label: w.label, preference, fullyAvailable, inPerson, virtual, slots };
		})
		.sort((a, b) => b.preference - a.preference);
}

/** The single date the most people can make. */
export function bestSlot(q: AvailabilityQuestion, subs: Submission[]) {
	const stats = availabilityStats(q, subs);
	const all = stats.flatMap((w) => w.slots.map((s) => ({ ...s, window: w.label })));
	return all.sort((a, b) => b.available - a.available)[0] ?? null;
}

export type AllocationResult = {
	buckets: { label: string; pct: number }[];
	carveOut: { label: string; pct: number } | null;
	respondents: number;
	abstained: number;
};

const ORDINALS = ['1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th'];

/**
 * The crowd's average split. Averaged over people who expressed a preference,
 * then rounded to the nearest step with the remainder pushed onto first place
 * so the published split always totals exactly 100%.
 */
export function allocationAverage(q: AllocationQuestion, subs: Submission[]): AllocationResult {
	const filled = subs
		.map((s) => s.answers[q.id])
		.filter(
			(v): v is { buckets: number[]; carveOut: number } =>
				!!v && typeof v === 'object' && 'buckets' in (v as object)
		);

	const abstained = subs.length - filled.length;
	if (!filled.length) {
		return { buckets: [], carveOut: null, respondents: 0, abstained };
	}

	const width = Math.max(...filled.map((f) => f.buckets.length));
	const sums = Array(width).fill(0);
	let carveSum = 0;

	for (const f of filled) {
		f.buckets.forEach((p, i) => (sums[i] += p));
		carveSum += f.carveOut ?? 0;
	}

	const round = (x: number) => Math.round(x / q.step) * q.step;
	let buckets = sums.map((s) => round(s / filled.length));
	let carve = round(carveSum / filled.length);

	// Rounding rarely lands on exactly 100; give or take the difference at the
	// top rather than publishing a split that doesn't add up.
	const drift = q.total - (buckets.reduce((a, b) => a + b, 0) + carve);
	if (buckets.length) buckets[0] += drift;
	else carve += drift;

	return {
		buckets: buckets
			.filter((p) => p > 0)
			.map((p, i) => ({ label: `${ORDINALS[i] ?? `${i + 1}th`} ${q.bucketNoun}`, pct: p })),
		carveOut: q.carveOut && carve > 0 ? { label: q.carveOut.label, pct: carve } : null,
		respondents: filled.length,
		abstained
	};
}

/** Who hasn't answered yet. */
export function missing(
	roster: { id: string; display_name: string }[],
	subs: Submission[]
): string[] {
	const done = new Set(subs.map((s) => s.playerId));
	return roster.filter((p) => !done.has(p.id)).map((p) => p.display_name);
}
