/* ═══════════════════════════════════════════════════════════════════════════
   WHO IS LOSING
   ═══════════════════════════════════════════════════════════════════════════
   One definition of "worst", used everywhere the question is asked.

   It was asked in three places and answered twice: `resolveVictim` sorted by
   wins then points to name the victim, the Standings board sorted the same way
   again to tint the bottom row, and The Punishment board now wants the bottom
   three. Three copies of a rule that decides who has to spend a day in an IHOP
   is two copies too many — the same reason `norm` lives on its own.

   Generic over the shape rather than importing `StandingsRow`, because that
   type lives in `$lib/server` and this is read on the client too.
   ═══════════════════════════════════════════════════════════════════════════ */

export type Ranked = {
	wins: number;
	losses: number;
	ties: number;
	pointsFor: number;
};

/** Games actually played. Zero for everybody until Week 1 kicks off. */
export function played(r: Ranked): number {
	return r.wins + r.losses + r.ties;
}

/**
 * Has anybody played yet?
 *
 * Worth asking before naming names. In August every row is 0-0-0 with zero
 * points, so "worst record" has an answer only in the sense that a sort has to
 * return something — and printing that on a public board would accuse whoever
 * happens to sort first of losing a season nobody has played.
 */
export function seasonStarted(rows: readonly Ranked[]): boolean {
	return rows.some((r) => played(r) > 0);
}

/**
 * Win rate, with a tie counting half.
 *
 * The old inline sorts compared raw wins, which called 3-11-0 and 3-10-1 the
 * same record and fell through to points. They are not the same record.
 */
export function winRate(r: Ranked): number {
	const games = played(r);
	return games === 0 ? 0 : (r.wins + r.ties / 2) / games;
}

/**
 * Worst first: lowest win rate, then fewest points scored.
 *
 * Points break the tie rather than points against, because the punishment is
 * for being bad, not for being unlucky — a team that scores least has the
 * weakest claim that the schedule did it to them.
 */
export function worstFirst<T extends Ranked>(rows: readonly T[]): T[] {
	return [...rows].sort((a, b) => winRate(a) - winRate(b) || a.pointsFor - b.pointsFor);
}

/** The bottom `n`, worst first — or nobody, while nobody has played. */
export function atRisk<T extends Ranked>(rows: readonly T[], n = 3): T[] {
	return seasonStarted(rows) ? worstFirst(rows).slice(0, n) : [];
}

/**
 * Why the At Risk section has nothing to show — or that it does.
 *
 * Two silences that look identical on the page and mean opposite things:
 * nobody has PLAYED yet, which is the calendar and fixes itself; and Sleeper
 * has never been WIRED UP, which is a job for the commissioner and does not.
 * A section that renders the same nothing for both hides the second one until
 * somebody notices in November that the standings were never coming.
 */
export function riskState(rows: readonly Ranked[], n = 3): 'listed' | 'preseason' | 'unwired' {
	if (rows.length === 0) return 'unwired';
	return atRisk(rows, n).length ? 'listed' : 'preseason';
}

/** A record as it is written on a scoreboard. Ties omitted when there are none. */
export function recordOf(r: Ranked): string {
	return r.ties > 0 ? `${r.wins}-${r.losses}-${r.ties}` : `${r.wins}-${r.losses}`;
}
