import { norm } from './text';

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

export const STATE_LABEL: Record<FieldState['state'], string> = {
	forced: "Commissioner's ruling",
	agreed: 'Agreed',
	waiting: 'In dispute',
	open: 'Not set'
};
