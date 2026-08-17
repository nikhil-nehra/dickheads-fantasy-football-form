/* ═══════════════════════════════════════════════════════════════════════════
   AUTO-PAIRING
   ═══════════════════════════════════════════════════════════════════════════
   Suggests rivalry pairs from everyone's beef rankings, so the commissioner
   has a sensible starting point instead of a blank page.

   Pure and deterministic, so it is unit-testable — the old version lived in a
   global function inside a page script and could only be exercised by driving
   a browser.
   ═══════════════════════════════════════════════════════════════════════════ */

export type BeefRankings = Record<string, string[]>;

/**
 * Mutual-desire score for a pair. Being ranked top by someone is worth n-1;
 * being ranked last is worth 0. Both directions count, so a pairing both
 * players want beats one only one player wants.
 */
export function pairScore(a: string, b: string, beef: BeefRankings): number {
	const score = (from: string, to: string): number => {
		const list = beef[from];
		if (!list) return 0;
		const i = list.indexOf(to);
		return i === -1 ? 0 : list.length - i;
	};
	return score(a, b) + score(b, a);
}

/**
 * Greedy maximum-desire pairing. Ties break on player id so the same input
 * always produces the same pairs — the old implementation re-shuffled as late
 * responses landed, which is why the Desk had to warn you about using auto
 * pairs at all.
 */
export function autoPair(playerIds: string[], beef: BeefRankings): [string, string][] {
	const candidates: { a: string; b: string; score: number }[] = [];

	for (let i = 0; i < playerIds.length; i++) {
		for (let j = i + 1; j < playerIds.length; j++) {
			candidates.push({
				a: playerIds[i],
				b: playerIds[j],
				score: pairScore(playerIds[i], playerIds[j], beef)
			});
		}
	}

	candidates.sort((x, y) => y.score - x.score || x.a.localeCompare(y.a) || x.b.localeCompare(y.b));

	const taken = new Set<string>();
	const pairs: [string, string][] = [];

	for (const c of candidates) {
		if (taken.has(c.a) || taken.has(c.b)) continue;
		taken.add(c.a);
		taken.add(c.b);
		pairs.push([c.a, c.b]);
	}

	// An odd roster leaves one person out; the Desk surfaces them rather than
	// silently dropping them.
	return pairs;
}

export function unpaired(playerIds: string[], pairs: [string, string][]): string[] {
	const taken = new Set(pairs.flat());
	return playerIds.filter((p) => !taken.has(p));
}

/** Problems worth nagging the commissioner about before rivalry week opens. */
export function pairingProblems(
	playerIds: string[],
	pairs: [string, string][]
): string[] {
	const problems: string[] = [];
	const seen = new Map<string, number>();
	const roster = new Set(playerIds);

	for (const [a, b] of pairs) {
		for (const p of [a, b]) {
			seen.set(p, (seen.get(p) ?? 0) + 1);
			if (!roster.has(p)) problems.push(`${p} is in a pairing but not on the roster.`);
		}
		if (a === b) problems.push(`${a} is paired with themselves.`);
	}

	for (const [p, n] of seen) {
		if (n > 1) problems.push(`${p} appears in ${n} pairings.`);
	}

	const left = unpaired(playerIds, pairs);
	if (left.length) problems.push(`Not paired: ${left.join(', ')}.`);

	return problems;
}
