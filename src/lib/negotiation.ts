import { norm } from './text';
import { parseMoney } from './money';

/* ═══════════════════════════════════════════════════════════════════════════
   AGREEMENT IS DERIVED, NEVER STORED
   ═══════════════════════════════════════════════════════════════════════════
   This is the one piece of the old implementation whose concurrency model was
   already right, and it is carried over unchanged.

   Each player writes only their own row. "Agreed" is not a flag anybody sets
   — it is what you get when both rows happen to hold the same value. So there
   is no contended write, no lock to win, and no way for one player to lock
   the other out. Either side can change their pick at any time and the line
   simply re-opens.

   Matching ignores case and spacing, so "loser buys dinner" and
   "Loser Buys Dinner" count as agreement.
   ═══════════════════════════════════════════════════════════════════════════ */

export type Entry = { field_key: string; proposal: string | null; pick: string | null };
export type Ruling = { field_key: string; value: string };

/* ── "We agreed there isn't one" ──────────────────────────────────────────────
   A bet and a side forfeit are both OPTIONAL, and two people deciding to
   have neither is a settled outcome — not an unanswered question. Those are
   different things and the board says so differently, so they cannot share the
   empty state.

   Nothing is a value like any other here: both sides pick NONE, and the same
   "do the two rows match?" rule that settles every other line settles this one
   too. No flag, no special case in the agreement logic, and either side can
   change their mind by picking something else.

   Matched through `norm`, so somebody typing "none" into the box means exactly
   what the button means. */
export const NONE = 'None';

export function isNone(value: string | null | undefined): boolean {
	return value !== null && value !== undefined && norm(value) === norm(NONE);
}

/**
 * Does what somebody left in the box amount to "there isn't one"?
 *
 * On a line that can be declined, an empty box and a bet of zero are not
 * half-finished answers — they are the answer, and the same one the switch
 * gives. Stored as a blank instead, they reach the board as "not set", which
 * reads as two people who never got round to it rather than two people who
 * decided against it.
 *
 * A line that CANNOT be declined has no such reading: emptying a rivalry name
 * means you are still thinking about the name, and there is no "no name".
 */
export function readsAsNone(
	value: string,
	opts: { optional?: boolean; money?: boolean } = {}
): boolean {
	if (!opts.optional) return false;
	const v = value.trim();
	if (!v) return true;
	return !!opts.money && parseMoney(v) === 0;
}

export type FieldState = {
	/** forced = commissioner ruling · agreed = both picked the same · waiting =
	    one or both have picked but they differ · open = nobody has picked */
	state: 'forced' | 'agreed' | 'waiting' | 'open';
	value: string | null;
	myProposal: string | null;
	theirProposal: string | null;
	myPick: string | null;
	theirPick: string | null;
};

function clean(s: string | null | undefined): string | null {
	const t = (s ?? '').trim();
	return t.length ? t : null;
}

function find<T extends { field_key: string }>(rows: T[], key: string): T | undefined {
	return rows.find((r) => r.field_key === key);
}

export function fieldStatus(
	fieldKey: string,
	mine: Entry[],
	theirs: Entry[],
	rulings: Ruling[] = []
): FieldState {
	const a = find(mine, fieldKey);
	const b = find(theirs, fieldKey);

	const myProposal = clean(a?.proposal);
	const theirProposal = clean(b?.proposal);
	const myPick = clean(a?.pick);
	const theirPick = clean(b?.pick);

	// A commissioner ruling overrides both sides.
	const forced = clean(find(rulings, fieldKey)?.value);
	if (forced) {
		return { state: 'forced', value: forced, myProposal, theirProposal, myPick, theirPick };
	}

	if (myPick && theirPick && norm(myPick) === norm(theirPick)) {
		return { state: 'agreed', value: myPick, myProposal, theirProposal, myPick, theirPick };
	}

	return {
		state: myPick || theirPick ? 'waiting' : 'open',
		value: null,
		myProposal,
		theirProposal,
		myPick,
		theirPick
	};
}

/** Board-side view: neither player is "me", so use the pair's two sides. */
export function pairFieldStatus(
	fieldKey: string,
	aEntries: Entry[],
	bEntries: Entry[],
	rulings: Ruling[] = []
): FieldState {
	return fieldStatus(fieldKey, aEntries, bEntries, rulings);
}

/* ── Lines with nothing to agree ──────────────────────────────────────────────
   Team colours share the table but not the mechanic. Your colours are yours,
   your rival's are theirs, and the Rivalry Board wants both — so there is no
   pair to compare and no state to derive. Agreement here would be the WRONG
   outcome: two teams in the same red is the one result the header cannot draw.

   They live in `negotiation_entry` anyway, and that is the whole point: your
   rival's answer is already loaded next to yours, so you can see what they
   picked BEFORE you pick against them. Nothing else on the site gives you a
   view of one specific other player's answer.

   `pick` holds the value; `proposal` is unused, because proposing a colour to
   somebody who does not get a vote is not a thing. */
export function ownValue(fieldKey: string, entries: Entry[]): string | null {
	return clean(find(entries, fieldKey)?.pick);
}

export const STATE_LABEL: Record<FieldState['state'], string> = {
	forced: "Commissioner's ruling",
	agreed: 'Agreed',
	waiting: 'In dispute',
	open: 'Not set'
};

/* ── Heat ──────────────────────────────────────────────────────── */

/**
 * How lit this rivalry is, 0–3, from how much of it the two of them have
 * actually settled.
 *
 * Settled rather than disputed is the deliberate choice: an argument is not a
 * rivalry, a signed bet is. A pair who have agreed a name, a bet AND a side
 * forfeit are locked in and get the hardest clash; a pair who have agreed
 * nothing sit perfectly still, and the stillness is the nag.
 *
 * Team colours are not counted, and cannot be: an 'own' line has nothing to
 * settle, so counting it would hand every pair two free points for answering
 * a question they could not have got wrong.
 */
export function heatFrom(settled: number): number {
	return Math.max(0, Math.min(3, settled));
}
