/**
 * The single normalisation used everywhere two pieces of human-typed text
 * need to count as "the same thing":
 *
 *   · de-duplicating ballot write-ins (a UNIQUE constraint on this value),
 *   · folding write-in votes together in a tally,
 *   · deciding whether two rivals have agreed on a line.
 *
 * It lives on its own so those three can never drift apart — the tally used
 * to lowercase only, while agreement also collapsed whitespace, so
 * "the  Commissioner" folded in one place and split in another.
 */
export function norm(s: string): string {
	return s.trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * "1st", "2nd", "3rd", "11th", "21st"… from the number itself.
 *
 * The naive `${n}th` reads fine from four onwards and is wrong for the three
 * that matter most — the Desk's split editor opened a brand new slice as
 * "1th place", which is the kind of typo that ends up printed on a board and
 * pasted into league chat.
 *
 * The rule rather than a lookup table, because a fourteen-team league runs
 * straight through the eleven/twelve/thirteen exception, where the last digit
 * lies: 11 is not "11st".
 */
export function ordinal(n: number): string {
	const teens = Math.abs(n) % 100;
	if (teens >= 11 && teens <= 13) return `${n}th`;

	switch (Math.abs(n) % 10) {
		case 1:
			return `${n}st`;
		case 2:
			return `${n}nd`;
		case 3:
			return `${n}rd`;
		default:
			return `${n}th`;
	}
}
