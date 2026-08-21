/* ═══════════════════════════════════════════════════════════════════════════
   MONEY
   ═══════════════════════════════════════════════════════════════════════════
   The bet on a rivalry is a dollar amount and nothing else. That is worth
   enforcing rather than trusting, because agreement on a negotiation line is
   derived by comparing the two players' answers as STRINGS — so one of them
   typing "20" and the other "$20" would sit there disagreeing forever over a
   number they both already agreed on.

   Everything is normalised to one canonical form on write. Two people who mean
   twenty dollars end up with the same string no matter how they typed it.
   ═══════════════════════════════════════════════════════════════════════════ */

/** A canonical money string, as `normaliseMoney` writes it. */
const CANONICAL = /^\$\d{1,3}(,\d{3})*(\.\d{2})?$/;

/**
 * Read a dollar amount out of whatever somebody typed. Returns null for
 * anything that is not a plain, non-negative amount — including prose that
 * merely CONTAINS a number, because "loser pays $20 and does a lap" is a
 * punishment, not a bet.
 */
export function parseMoney(raw: string | null | undefined): number | null {
	const text = (raw ?? '').trim();
	if (!text) return null;

	// A leading $ and thousands separators are the only decoration allowed.
	const bare = text.replace(/^\$/, '').replace(/,/g, '').trim();
	if (!/^\d+(\.\d{1,2})?$/.test(bare)) return null;

	const n = Number(bare);
	if (!Number.isFinite(n) || n < 0 || n > 1_000_000) return null;
	return n;
}

/** `20` → `$20`, `20.5` → `$20.50`. Whole amounts lose the pointless `.00`. */
export function formatMoney(n: number): string {
	const whole = Number.isInteger(n);
	return `$${n.toLocaleString('en-US', {
		minimumFractionDigits: whole ? 0 : 2,
		maximumFractionDigits: 2
	})}`;
}

/**
 * The canonical stored form, or null if it is not an amount at all.
 *
 * Stored formatted rather than as a bare number so every surface — board,
 * Desk, audit log — reads correctly without having to know which fields are
 * money.
 */
export function normaliseMoney(raw: string | null | undefined): string | null {
	const n = parseMoney(raw);
	return n === null ? null : formatMoney(n);
}

/**
 * Does this stored value look like money we wrote?
 *
 * The board uses this to decide between the big-figure treatment and plain
 * prose, so a bet saved before this field became numeric still renders as the
 * sentence it is rather than being mangled into a number.
 */
export function isMoney(value: string | null | undefined): boolean {
	return CANONICAL.test((value ?? '').trim());
}
