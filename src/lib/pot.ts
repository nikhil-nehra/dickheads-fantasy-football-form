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

export type SplitSlice = {
	label: string;
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
	{ label: '1st place', pct: 60 },
	{ label: '2nd place', pct: 30 },
	{ label: '3rd place', pct: 10 }
];

export const MAX_SLICES = 8;
export const MAX_LABEL = 40;

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

		for (const item of list.slice(0, MAX_SLICES)) {
			const s = (item ?? {}) as { label?: unknown; pct?: unknown };
			const label = String(s.label ?? '').trim().slice(0, MAX_LABEL);
			const pct = Number(s.pct);
			if (!label) {
				problems.push({ field: 'split', message: 'Every slice needs a label.' });
				continue;
			}
			if (!Number.isInteger(pct) || pct <= 0 || pct > 100) {
				problems.push({ field: 'split', message: `"${label}" needs a whole percent from 1 to 100.` });
				continue;
			}
			slices.push({ label, pct });
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

/** Parse what came out of the database, tolerating anything hand-edited. */
export function parsePot(buyIn: number | null | undefined, splitJson: string | null | undefined): PotConfig {
	let split: SplitSlice[] = [];
	try {
		const parsed = JSON.parse(splitJson || '[]');
		if (Array.isArray(parsed)) {
			split = parsed
				.filter((s): s is SplitSlice => !!s && typeof s === 'object')
				.map((s) => ({ label: String(s.label ?? ''), pct: Number(s.pct) || 0 }))
				.filter((s) => s.label && s.pct > 0);
		}
	} catch {
		split = [];
	}
	return { buyIn: Number(buyIn) || 0, split };
}

/* ── The money ───────────────────────────────────────────────────────────── */

export type Payout = SplitSlice & { amount: number };

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
		return { ...s, amount };
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
