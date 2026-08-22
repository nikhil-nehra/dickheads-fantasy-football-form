/* ═══════════════════════════════════════════════════════════════════════════
   THE POT
   ═══════════════════════════════════════════════════════════════════════════
   Three numbers and a list of names.

   The buy-in and the payout split are DECISIONS — the commissioner sets them
   on the Desk and they sit in `pot_config`. The intake survey informed them;
   it is not them, which is why nothing in this file reads a survey.

   Who has paid is the same kind of decision, marked on the Desk. Sleeper does
   have a League Dues Tracker, but reading it needs an account-wide token on a
   Worker secret that expires without announcing itself — one place that cannot
   go quietly stale beats two that can.
   ═══════════════════════════════════════════════════════════════════════════ */

import { ordinal } from './text';

/* ── Placements ───────────────────────────────────────────────────────────
   A slice used to be a free-text label and a percent, and the label was the
   only thing saying who got paid. It could say anything: the Desk's own
   button wrote "1th place", nothing stopped two slices both claiming 1st, and
   a typo'd "2nd palce" would have gone straight to the board with money
   beside it.

   A slice now names a PLACEMENT — which table, and which position in it.
   There are twenty-eight of those, the type knows all of them, and the label
   is derived at the point it is printed. Nonsense is unrepresentable rather
   than merely discouraged, and "who is this slice for?" has an answer the
   code can read instead of a sentence only a human can.
   ───────────────────────────────────────────────────────────────────────── */

/**
 * The two tables somebody can finish in.
 *
 * A league that plays fourteen weeks and then hands the whole pot to whoever
 * got hot in the last three has quietly told everyone the regular season was
 * practice. So the regular season is a TABLE here, not a carve-out: it has
 * fourteen places like the bracket does, and the split can pay as far down it
 * as the commissioner wants.
 *
 * It was briefly modelled as a single "regular-season slice" — one press,
 * first place only, then latched. That decided on the league's behalf that
 * only the winner of the fourteen weeks could be paid, which is not a rule
 * anybody voted for.
 */
export const BRACKETS = ['final', 'regular'] as const;
export type Bracket = (typeof BRACKETS)[number];

export const BRACKET_LABEL: Record<Bracket, string> = {
	final: 'Final standings',
	regular: 'Regular season'
};

/**
 * 1st through 14th — one per seat at the table.
 *
 * A literal rather than a number, so a fifteenth placement does not typecheck.
 * Growing the league means adding to this list, which is the edit you WANT to
 * be forced into: every payout, board and editor reads its bounds from here.
 */
export const PLACES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14] as const;
export type Place = (typeof PLACES)[number];

export type Placement = { bracket: Bracket; place: Place };

/** Every placement that can be paid, in the order the Desk offers them. */
export const PLACEMENTS: readonly Placement[] = BRACKETS.flatMap((bracket) =>
	PLACES.map((place) => ({ bracket, place }))
);

export function isBracket(v: unknown): v is Bracket {
	return typeof v === 'string' && (BRACKETS as readonly string[]).includes(v);
}

export function isPlace(v: unknown): v is Place {
	return typeof v === 'number' && (PLACES as readonly number[]).includes(v);
}

/** What the board prints. Derived at the last moment, so it cannot drift. */
export function placementLabel(p: Placement): string {
	return p.bracket === 'regular'
		? `${ordinal(p.place)} place, regular season`
		: `${ordinal(p.place)} place`;
}

/** One opaque string for a placement, for keying a list or a `<select>`. */
export function placementKey(p: Placement): string {
	return `${p.bracket}:${p.place}`;
}

export function parsePlacementKey(key: string): Placement | null {
	const [bracket, place] = key.split(':');
	const n = Number(place);
	return isBracket(bracket) && isPlace(n) ? { bracket, place: n } : null;
}

/** The same seat in the same table. */
export function samePlacement(a: Placement, b: Placement): boolean {
	return a.bracket === b.bracket && a.place === b.place;
}

export type SplitSlice = Placement & {
	/** Whole percent of the pot. */
	pct: number;
};

export type PotConfig = {
	/** Whole dollars per player. Zero means "not set yet". */
	buyIn: number;
	split: SplitSlice[];
};

export const EMPTY_POT: PotConfig = { buyIn: 0, split: [] };

/** What the Desk starts you with, so the split editor is never a blank page. */
export const SUGGESTED_SPLIT: SplitSlice[] = [
	{ bracket: 'final', place: 1, pct: 60 },
	{ bracket: 'final', place: 2, pct: 30 },
	{ bracket: 'final', place: 3, pct: 10 }
];

/**
 * How many slices a split may hold, across both tables.
 *
 * Not a limit on which placements exist — any of the twenty-eight can be
 * paid — only on how many at once, so the editor and the board stay readable.
 */
export const MAX_SLICES = 8;

/* ── Validation ──────────────────────────────────────────────────────────── */

export type PotProblem = { field: 'buyIn' | 'split'; message: string };

/**
 * Check a candidate config from the Desk.
 *
 * A split that does not total 100% is the one error worth being strict about:
 * every figure the board prints is a percentage OF the pot, so a split summing
 * to 95% quietly publishes a pot that pays out less than it holds, and nobody
 * notices until somebody is owed money.
 *
 * An entirely empty split is allowed — that is "not decided yet", and the
 * board says so rather than inventing one.
 */
export function validatePot(input: unknown): { ok: true; value: PotConfig } | { ok: false; problems: PotProblem[] } {
	const problems: PotProblem[] = [];
	const raw = (input ?? {}) as { buyIn?: unknown; split?: unknown };

	const buyIn = Number(raw.buyIn);
	if (!Number.isInteger(buyIn) || buyIn < 0 || buyIn > 100_000) {
		problems.push({ field: 'buyIn', message: 'Buy-in must be a whole dollar amount.' });
	}

	const slices: SplitSlice[] = [];
	if (raw.split !== undefined && !Array.isArray(raw.split)) {
		problems.push({ field: 'split', message: 'The split must be a list of slices.' });
	} else {
		const list = (raw.split ?? []) as unknown[];
		if (list.length > MAX_SLICES) {
			problems.push({ field: 'split', message: `At most ${MAX_SLICES} slices.` });
		}

		/* Strict on the way in. The read path below still migrates the labelled
		   rows already on disk, but nothing NEW gets to invent a slice: a
		   payout has to name one of the twenty-eight placements. */
		for (const item of list.slice(0, MAX_SLICES)) {
			const s = (item ?? {}) as { bracket?: unknown; place?: unknown; pct?: unknown };
			if (!isBracket(s.bracket) || !isPlace(s.place)) {
				problems.push({
					field: 'split',
					message: 'Every slice has to name a placement — a finishing position in one of the two tables.'
				});
				continue;
			}

			const placement: Placement = { bracket: s.bracket, place: s.place };
			const label = placementLabel(placement);
			const pct = Number(s.pct);

			if (!Number.isInteger(pct) || pct <= 0 || pct > 100) {
				problems.push({ field: 'split', message: `"${label}" needs a whole percent from 1 to 100.` });
				continue;
			}
			// Newly checkable, and worth checking: two slices both claiming 1st
			// used to be a pair of identical strings nothing could tell apart.
			if (slices.some((x) => samePlacement(x, placement))) {
				problems.push({ field: 'split', message: `"${label}" is in the split twice.` });
				continue;
			}

			slices.push({ ...placement, pct });
		}

		const total = slices.reduce((a, b) => a + b.pct, 0);
		if (slices.length && total !== 100) {
			problems.push({
				field: 'split',
				message: `The split totals ${total}%. It has to be exactly 100%.`
			});
		}
	}

	if (problems.length) return { ok: false, problems };
	return { ok: true, value: { buyIn, split: slices } };
}

/* Rows written before slices were typed carried a label and nothing else.
   They are still on disk, so the READ path understands them; the next save
   from the Desk rewrites the column in the new shape and they are gone. */
const LEGACY_PLACE = /^\s*(\d{1,2})\s*(?:st|nd|rd|th)\s+place\s*(?:,\s*(regular[-\s]season)\s*)?$/i;
const LEGACY_REG_LEADER = /^\s*regular[-\s]season\s+points\s+leader\s*$/i;

function readSlice(raw: unknown): SplitSlice | null {
	const s = (raw ?? {}) as { bracket?: unknown; place?: unknown; pct?: unknown; label?: unknown };

	const pct = Number(s.pct) || 0;
	if (pct <= 0) return null;

	if (isBracket(s.bracket) && isPlace(s.place)) {
		return { bracket: s.bracket, place: s.place, pct };
	}

	const label = String(s.label ?? '');

	// The intake survey worded its carve-out as the points leader. Nothing but
	// a hand-edit could have written it here, but it costs one line to read.
	if (LEGACY_REG_LEADER.test(label)) {
		return { bracket: 'regular', place: 1, pct };
	}

	const m = LEGACY_PLACE.exec(label);
	if (!m) return null;

	const place = Number(m[1]);
	if (!isPlace(place)) return null;

	return { bracket: m[2] ? 'regular' : 'final', place, pct };
}

/**
 * Parse what came out of the database, tolerating anything hand-edited.
 *
 * A slice it cannot read at all is dropped rather than guessed at, which can
 * leave the split under 100%. That is the honest outcome: the board would
 * otherwise print a placement nobody chose, with money against it.
 */
export function parsePot(buyIn: number | null | undefined, splitJson: string | null | undefined): PotConfig {
	let split: SplitSlice[] = [];
	try {
		const parsed = JSON.parse(splitJson || '[]');
		if (Array.isArray(parsed)) {
			split = parsed.map(readSlice).filter((s): s is SplitSlice => s !== null);
		}
	} catch {
		split = [];
	}
	return { buyIn: Number(buyIn) || 0, split };
}

/* ── The money ───────────────────────────────────────────────────────────── */

export type Payout = SplitSlice & { label: string; amount: number };

/**
 * The split in real dollars.
 *
 * Rounding is done against the RUNNING total rather than each slice
 * independently, so the printed amounts always add up to the pot exactly. Four
 * slices of a $700 pot at 3 × 33% + 1% rounds to 231 + 231 + 231 + 7 = 700,
 * where naive per-slice rounding gives 699.
 */
export function payouts(split: SplitSlice[], pot: number): Payout[] {
	let allocated = 0;
	let cumulativePct = 0;

	return split.map((s, i) => {
		cumulativePct += s.pct;
		const target = i === split.length - 1 ? pot : Math.round((pot * cumulativePct) / 100);
		const amount = Math.max(0, target - allocated);
		allocated += amount;
		return { ...s, label: placementLabel(s), amount };
	});
}

/* ── Who has paid ────────────────────────────────────────────────────────── */

/** One row out of the `payment` table. A missing row simply means unpaid. */
export type PaymentRow = { player_id: string; paid: number };

export type PayerRow = {
	playerId: string;
	name: string;
	paid: boolean;
};

export type Ledger = {
	paid: PayerRow[];
	owing: PayerRow[];
	/** Dollars in, assuming everyone paid the full buy-in. */
	collected: number;
};

/**
 * Split the roster into paid and owing, in roster order.
 *
 * Roster order rather than "paid first" is deliberate: the list is read to find
 * one specific person, and a stable position makes that a glance instead of a
 * search. The colour already carries the state.
 */
export function ledger(
	roster: readonly { id: string; display_name: string }[],
	payments: readonly PaymentRow[],
	buyIn: number
): Ledger {
	const paidIds = new Set(payments.filter((p) => p.paid === 1).map((p) => p.player_id));

	const paid: PayerRow[] = [];
	const owing: PayerRow[] = [];

	for (const p of roster) {
		const row = { playerId: p.id, name: p.display_name, paid: paidIds.has(p.id) };
		(row.paid ? paid : owing).push(row);
	}

	return { paid, owing, collected: paid.length * buyIn };
}
