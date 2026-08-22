import { worstFirst } from '../standings';

/* ═══════════════════════════════════════════════════════════════════════════
   SLEEPER — read side
   ═══════════════════════════════════════════════════════════════════════════
   The app reads league data ONLY from the `sleeper_cache` table, which is
   written exclusively by workers/sleeper-sync on a cron. No page load ever
   calls Sleeper, so:

     · no third-party latency on the request path,
     · no rate-limit exposure (Sleeper asks for under 1000 calls/min, and the
       players catalogue for at most once a day),
     · the site keeps working when Sleeper is down — it just shows older data,
       stamped with when it was fetched.
   ═══════════════════════════════════════════════════════════════════════════ */

export type StandingsRow = {
	rosterId: number;
	ownerId: string | null;
	displayName: string;
	wins: number;
	losses: number;
	ties: number;
	pointsFor: number;
	pointsAgainst: number;
};

export type SleeperMatchup = {
	rosterId: number;
	matchupId: number | null;
	points: number;
};

export type SleeperUser = {
	userId: string;
	displayName: string;
	teamName: string | null;
	avatar: string | null;
};

/**
 * The league's draft, as the sync worker flattens it out of
 * `/v1/draft/<draft_id>`.
 *
 * This is the ONLY source of the draft date on the site. It is not duplicated
 * in a constant anywhere: the commissioner moves the draft in the Sleeper app
 * and the board follows within a cron tick, with nothing to remember to edit.
 */
export type SleeperDraft = {
	draftId: string;
	/** Epoch milliseconds, or null while no time has been set. */
	startTime: number | null;
	/** 'pre_draft' | 'drafting' | 'complete', per Sleeper. */
	status: string | null;
	/** 'snake', 'linear' or 'auction'. */
	type: string | null;
	rounds: number | null;
	/** Seconds on the pick clock. */
	pickTimer: number | null;
	teams: number | null;
};

/** Cache keys written by the sync worker. */
export type CacheKey =
	| 'meta'
	| 'state'
	| 'league'
	| 'draft'
	| 'users'
	| 'rosters'
	| 'standings'
	| 'brackets'
	| `matchups:${number}`;

export async function readSleeper<T>(db: D1Database, key: CacheKey): Promise<T | null> {
	const row = await db
		.prepare('SELECT payload FROM sleeper_cache WHERE key = ?')
		.bind(key)
		.first<{ payload: string }>();
	if (!row) return null;
	try {
		return JSON.parse(row.payload) as T;
	} catch {
		return null;
	}
}

export async function writeSleeper(db: D1Database, key: string, payload: unknown): Promise<void> {
	await db
		.prepare(
			`INSERT INTO sleeper_cache (key, payload, fetched_at)
			 VALUES (?1, ?2, datetime('now'))
			 ON CONFLICT(key) DO UPDATE SET payload = excluded.payload, fetched_at = datetime('now')`
		)
		.bind(key, JSON.stringify(payload))
		.run();
}

/* ── Deriving the punishment's victim from real results ──────────────────── */

export type VictimResolution = { targetId: string; label: string; who: string | null };

/**
 * Resolve who actually serves the punishment.
 *
 * These were human judgement calls before, argued about in January. Both of
 * the options the survey now offers are straight reads: last place off the
 * standings, the toilet bowl off the losers bracket. A write-in is neither,
 * and is handed back unresolved rather than approximated.
 */
export function resolveVictim(
	targetId: string,
	standings: StandingsRow[] | null,
	losersBracket: { w?: number; l?: number; r?: number }[] | null,
	rosterName: (rosterId: number) => string
): VictimResolution {
	switch (targetId) {
		case 'reg-last': {
			// One definition of "worst", shared with the boards. See $lib/standings.
			const worst = worstFirst(standings ?? [])[0] ?? null;
			return {
				targetId,
				label: 'Last place, regular season',
				who: worst ? worst.displayName : null
			};
		}

		case 'toilet': {
			// The final game of the consolation bracket; its loser takes it.
			const rounds = losersBracket ?? [];
			const finalRound = Math.max(0, ...rounds.map((m) => m.r ?? 0));
			const final = rounds.find((m) => (m.r ?? 0) === finalRound && m.l != null);
			return {
				targetId,
				label: 'Last place, toilet bowl',
				who: final?.l != null ? rosterName(final.l) : null
			};
		}

		default:
			/* A write-in stays a human call, and so does any id from a ballot
			   that has since changed shape. Both are the same case: an id this
			   function cannot resolve is reported as itself with no victim
			   attached, never guessed at. */
			return { targetId, label: targetId, who: null };
	}
}
