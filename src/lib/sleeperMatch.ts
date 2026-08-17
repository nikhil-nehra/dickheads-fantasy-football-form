/* ═══════════════════════════════════════════════════════════════════════════
   SUGGESTING SLEEPER LINKS
   ═══════════════════════════════════════════════════════════════════════════
   Real leagues do not use real names on Sleeper. This one is all handles —
   pdande97, scomeaux11, LyanRatin, veansarg — so matching display name to
   display name links nobody at all.

   These functions SUGGEST a link and score how confident they are. Nothing
   here ever writes: a suggestion is a shortcut for the commissioner, not a
   decision. A wrong automatic link is worse than no link, because it silently
   attributes someone else's results to you.
   ═══════════════════════════════════════════════════════════════════════════ */

export type SleeperAccount = {
	userId: string;
	displayName: string;
	teamName?: string | null;
	rosterId?: number | null;
};

export type Suggestion = { userId: string; score: number; why: string };

/** Letters and digits only, lowercased. */
function squash(s: string): string {
	return s.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** Letters only — handles usually append a birth year or jersey number. */
function letters(s: string): string {
	return s.toLowerCase().replace(/[^a-z]/g, '');
}

function levenshtein(a: string, b: string): number {
	if (a === b) return 0;
	if (!a.length) return b.length;
	if (!b.length) return a.length;

	let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
	for (let i = 1; i <= a.length; i++) {
		const curr = [i];
		for (let j = 1; j <= b.length; j++) {
			curr[j] = Math.min(
				prev[j] + 1,
				curr[j - 1] + 1,
				prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
			);
		}
		prev = curr;
	}
	return prev[b.length];
}

function similarity(a: string, b: string): number {
	const longest = Math.max(a.length, b.length);
	if (!longest) return 0;
	return 1 - levenshtein(a, b) / longest;
}

/**
 * The shapes a handle usually takes for "Nikhil Nehra":
 * nikhilnehra · nnehra · nikhiln · nehra · nikhil
 */
function keysFor(fullName: string): { key: string; why: string; weight: number }[] {
	const parts = fullName.trim().split(/\s+/).filter(Boolean).map(letters);
	if (!parts.length) return [];

	const first = parts[0];
	const last = parts[parts.length - 1];
	const out: { key: string; why: string; weight: number }[] = [
		{ key: first + last, why: 'first + last name', weight: 100 }
	];

	if (parts.length > 1) {
		out.push(
			{ key: first[0] + last, why: 'initial + last name', weight: 96 },
			{ key: first + last[0], why: 'first name + initial', weight: 94 },
			{ key: last + first, why: 'last + first name', weight: 90 },
			{ key: last, why: 'last name', weight: 82 },
			{ key: first, why: 'first name', weight: 78 }
		);
	}

	return out;
}

/** Score one account against one roster name. 0–100; 0 means no signal. */
export function scoreAccount(fullName: string, account: SleeperAccount): Suggestion {
	const candidates = [
		{ text: account.displayName, source: 'handle' },
		...(account.teamName ? [{ text: account.teamName, source: 'team name' }] : [])
	];

	let best: Suggestion = { userId: account.userId, score: 0, why: '' };

	for (const { text, source } of candidates) {
		const squashed = squash(text);
		const lettersOnly = letters(text);

		for (const { key, why, weight } of keysFor(fullName)) {
			if (!key) continue;

			// Exact, or exact once a trailing number is dropped.
			if (squashed === key || lettersOnly === key) {
				if (weight > best.score) best = { userId: account.userId, score: weight, why: `${source} is ${why}` };
				continue;
			}

			// Handle starts with the key, e.g. samaymoh -> samaymohapatra.
			if (key.length >= 4 && (key.startsWith(lettersOnly) || lettersOnly.startsWith(key))) {
				const score = weight - 12;
				if (score > best.score)
					best = { userId: account.userId, score, why: `${source} looks like ${why}` };
				continue;
			}

			// Near-miss: transpositions and typos, e.g. lyanratin ~ ryanlatin.
			const sim = similarity(lettersOnly, key);
			if (sim >= 0.75) {
				const score = Math.round(weight * sim) - 20;
				if (score > best.score)
					best = { userId: account.userId, score, why: `${source} is close to ${why}` };
			}
		}
	}

	return best;
}

/** Ranked suggestions for one roster name, best first. */
export function suggestFor(
	fullName: string,
	accounts: SleeperAccount[],
	taken: Set<string> = new Set()
): Suggestion[] {
	return accounts
		.filter((a) => !taken.has(a.userId))
		.map((a) => scoreAccount(fullName, a))
		.filter((s) => s.score > 0)
		.sort((a, b) => b.score - a.score);
}

/**
 * Suggest a whole mapping at once, greedily: strongest pairing first, and each
 * account used at most once.
 */
export function suggestAll(
	players: { id: string; display_name: string }[],
	accounts: SleeperAccount[]
): Record<string, Suggestion> {
	const pairs: { playerId: string; suggestion: Suggestion }[] = [];

	for (const p of players) {
		for (const s of suggestFor(p.display_name, accounts)) {
			pairs.push({ playerId: p.id, suggestion: s });
		}
	}

	pairs.sort((a, b) => b.suggestion.score - a.suggestion.score);

	const out: Record<string, Suggestion> = {};
	const usedAccounts = new Set<string>();

	for (const { playerId, suggestion } of pairs) {
		if (out[playerId] || usedAccounts.has(suggestion.userId)) continue;
		out[playerId] = suggestion;
		usedAccounts.add(suggestion.userId);
	}

	return out;
}

/** Confidence bands used by the Desk to decide how loudly to hedge. */
export function confidence(score: number): 'strong' | 'likely' | 'weak' {
	if (score >= 90) return 'strong';
	if (score >= 65) return 'likely';
	return 'weak';
}
