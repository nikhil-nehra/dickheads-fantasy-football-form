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

/** Cache keys written by the sync worker. */
export type CacheKey =
	| 'meta'
	| 'state'
	| 'league'
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
 * These were all human judgement calls before, argued about in January. Three
 * of the four are now straight reads off the standings, and the fourth
 * (toilet bowl) off the losers bracket.
 */
export function resolveVictim(
	targetId: string,
	standings: StandingsRow[] | null,
	losersBracket: { w?: number; l?: number; r?: number }[] | null,
	rosterName: (rosterId: number) => string
): VictimResolution {
	const by = <T>(rows: T[], cmp: (a: T, b: T) => number): T | null =>
		rows.length ? [...rows].sort(cmp)[0] : null;

	switch (targetId) {
		case 'reg-last': {
			const worst = by(
				standings ?? [],
				(a, b) => a.wins - b.wins || a.pointsFor - b.pointsFor
			);
			return {
				targetId,
				label: 'Last place — regular season',
				who: worst ? worst.displayName : null
			};
		}

		case 'fewest-pts': {
			const fewest = by(standings ?? [], (a, b) => a.pointsFor - b.pointsFor);
			return {
				targetId,
				label: 'Fewest total points scored',
				who: fewest ? fewest.displayName : null
			};
		}

		case 'toilet': {
			// The final game of the consolation bracket; its loser takes it.
			const rounds = losersBracket ?? [];
			const finalRound = Math.max(0, ...rounds.map((m) => m.r ?? 0));
			const final = rounds.find((m) => (m.r ?? 0) === finalRound && m.l != null);
			return {
				targetId,
				label: 'Loser of the consolation bracket',
				who: final?.l != null ? rosterName(final.l) : null
			};
		}

		default:
			// 'final-last', 'both' and any write-in stay a human call.
			return { targetId, label: targetId, who: null };
	}
}
