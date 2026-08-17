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
