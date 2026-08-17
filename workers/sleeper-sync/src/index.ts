/* ═══════════════════════════════════════════════════════════════════════════
   SLEEPER SYNC
   ═══════════════════════════════════════════════════════════════════════════
   Pulls the league from Sleeper on a cron and writes snapshots into
   `sleeper_cache`. The app reads only those snapshots, so a page load never
   waits on a third party and the site keeps serving (slightly older) data if
   Sleeper is down.

   Sleeper's API is read-only and needs no auth. The one hard rule in its docs
   is to stay under 1000 calls a minute; this does about five calls every ten
   minutes.

   Deliberately NOT fetched: /v1/players/nfl. It is a 5 MB catalogue of every
   player in the NFL, and nothing on this site renders individual players — so
   downloading and storing it daily would be pure waste. Add it here if a
   future board needs player names.
   ═══════════════════════════════════════════════════════════════════════════ */

const API = 'https://api.sleeper.app/v1';

type Env = {
	DB: D1Database;
	SEASON: string;
	SLEEPER_LEAGUE_ID: string;
};

type SleeperUser = {
	user_id: string;
	display_name: string;
	metadata?: { team_name?: string };
	avatar?: string | null;
};

type SleeperRoster = {
	roster_id: number;
	owner_id: string | null;
	settings?: {
		wins?: number;
		losses?: number;
		ties?: number;
		fpts?: number;
		fpts_decimal?: number;
		fpts_against?: number;
		fpts_against_decimal?: number;
	};
};

type BracketMatch = { r?: number; m?: number; w?: number | null; l?: number | null };

async function get<T>(path: string): Promise<T | null> {
	try {
		const res = await fetch(`${API}${path}`, {
			headers: { accept: 'application/json' },
			cf: { cacheTtl: 60, cacheEverything: true }
		});
		if (!res.ok) return null;
		return (await res.json()) as T;
	} catch {
		return null;
	}
}

async function put(db: D1Database, key: string, payload: unknown): Promise<void> {
	await db
		.prepare(
			`INSERT INTO sleeper_cache (key, payload, fetched_at)
			 VALUES (?1, ?2, datetime('now'))
			 ON CONFLICT(key) DO UPDATE SET payload = excluded.payload, fetched_at = datetime('now')`
		)
		.bind(key, JSON.stringify(payload))
		.run();
}

/** Sleeper splits points into whole and decimal parts. */
function points(whole?: number, decimal?: number): number {
	return (whole ?? 0) + (decimal ?? 0) / 100;
}

function norm(s: string): string {
	return s.trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Link roster entries to Sleeper accounts by EXACT name.
 *
 * In practice this matches almost nobody: real leagues use handles, not real
 * names, and in this one it matches zero of fourteen. That is deliberate — the
 * fuzzy matching lives in src/lib/sleeperMatch.ts and only ever produces
 * SUGGESTIONS on the Desk, because a wrong automatic link silently credits one
 * player's results to another. This pass exists for the easy exact case only.
 *
 * It also only fills columns that are still NULL, so a link the commissioner
 * set by hand is never overwritten.
 */
async function linkPlayers(
	db: D1Database,
	users: SleeperUser[],
	rosters: SleeperRoster[]
): Promise<number> {
	const { results: players } = await db
		.prepare('SELECT id, display_name FROM player WHERE sleeper_user_id IS NULL')
		.all<{ id: string; display_name: string }>();
	if (!players.length) return 0;

	const rosterOf = new Map(rosters.map((r) => [r.owner_id ?? '', r.roster_id]));

	const byName = new Map<string, SleeperUser>();
	for (const u of users) {
		byName.set(norm(u.display_name), u);
		const team = u.metadata?.team_name;
		if (team) byName.set(norm(team), u);
	}

	let linked = 0;
	for (const p of players) {
		const match = byName.get(norm(p.display_name));
		if (!match) continue;
		await db
			.prepare(
				`UPDATE player SET sleeper_user_id = ?2, sleeper_roster_id = ?3
				  WHERE id = ?1 AND sleeper_user_id IS NULL`
			)
			.bind(p.id, match.user_id, rosterOf.get(match.user_id) ?? null)
			.run();
		linked++;
	}
	return linked;
}

/** Close any survey whose deadline has passed. */
async function applyDeadlines(db: D1Database): Promise<number> {
	const res = await db
		.prepare(
			`UPDATE survey
			    SET status = 'closed', changed_at = datetime('now'), changed_by = 'auto'
			  WHERE status = 'open' AND closes_at IS NOT NULL AND closes_at <= datetime('now')`
		)
		.run();
	if (res.meta.changes > 0) {
		await db
			.prepare("INSERT INTO audit_log (actor, action, detail) VALUES ('cron','survey.autoclose',?)")
			.bind(`${res.meta.changes} survey(s)`)
			.run();
	}
	return res.meta.changes;
}

async function sync(env: Env, daily: boolean): Promise<Record<string, unknown>> {
	const db = env.DB;
	const league = env.SLEEPER_LEAGUE_ID?.trim();

	// Housekeeping runs whether or not Sleeper is configured.
	const autoclosed = await applyDeadlines(db);
	await db
		.prepare('DELETE FROM rate_limit WHERE expires_at < ?')
		.bind(Math.floor(Date.now() / 1000))
		.run();

	if (!league) {
		return { skipped: 'SLEEPER_LEAGUE_ID is not set', autoclosed };
	}

	const state = await get<{ week?: number; season?: string; season_type?: string }>('/state/nfl');
	if (state) await put(db, 'state', state);

	const [info, users, rosters] = await Promise.all([
		get<unknown>(`/league/${league}`),
		get<SleeperUser[]>(`/league/${league}/users`),
		get<SleeperRoster[]>(`/league/${league}/rosters`)
	]);

	if (info) await put(db, 'league', info);

	if (users) {
		await put(
			db,
			'users',
			users.map((u) => ({
				userId: u.user_id,
				displayName: u.display_name,
				teamName: u.metadata?.team_name ?? null,
				avatar: u.avatar ?? null
			}))
		);
	}

	let linked = 0;
	if (users && rosters) {
		await put(db, 'rosters', rosters);
		linked = await linkPlayers(db, users, rosters);

		// Standings, pre-computed here so no page has to derive them.
		const nameOf = new Map(
			users.map((u) => [u.user_id, u.metadata?.team_name || u.display_name])
		);
		const standings = rosters
			.map((r) => ({
				rosterId: r.roster_id,
				ownerId: r.owner_id,
				displayName: r.owner_id ? (nameOf.get(r.owner_id) ?? 'Unclaimed') : 'Unclaimed',
				wins: r.settings?.wins ?? 0,
				losses: r.settings?.losses ?? 0,
				ties: r.settings?.ties ?? 0,
				pointsFor: points(r.settings?.fpts, r.settings?.fpts_decimal),
				pointsAgainst: points(r.settings?.fpts_against, r.settings?.fpts_against_decimal)
			}))
			.sort(
				(a, b) => b.wins - a.wins || b.pointsFor - a.pointsFor || a.displayName.localeCompare(b.displayName)
			);

		await put(db, 'standings', standings);
	}

	const week = state?.week ?? 0;
	if (week > 0) {
		const matchups = await get<{ roster_id: number; matchup_id: number | null; points: number }[]>(
			`/league/${league}/matchups/${week}`
		);
		if (matchups) {
			await put(
				db,
				`matchups:${week}`,
				matchups.map((m) => ({
					rosterId: m.roster_id,
					matchupId: m.matchup_id,
					points: m.points ?? 0
				}))
			);
		}
	}

	// Brackets only exist late in the season and barely change; daily is plenty.
	if (daily) {
		const [winners, losers] = await Promise.all([
			get<BracketMatch[]>(`/league/${league}/winners_bracket`),
			get<BracketMatch[]>(`/league/${league}/losers_bracket`)
		]);
		if (winners || losers) await put(db, 'brackets', { winners, losers });
	}

	await put(db, 'meta', { at: new Date().toISOString(), week, daily });

	return { week, linked, autoclosed, daily };
}

export default {
	async scheduled(event: ScheduledController, env: Env, ctx: ExecutionContext) {
		ctx.waitUntil(sync(env, event.cron === '17 9 * * *').then(() => undefined));
	},

	/**
	 * Manual trigger, so the sync can be exercised without waiting for a cron
	 * tick. Only reachable on the worker's own URL, which is not linked from
	 * anywhere and carries no user data.
	 */
	async fetch(request: Request, env: Env) {
		const url = new URL(request.url);
		if (url.pathname !== '/run') {
			return new Response('sleeper-sync: POST /run to trigger', { status: 404 });
		}
		if (request.method !== 'POST') {
			return new Response('POST required', { status: 405 });
		}
		const result = await sync(env, url.searchParams.get('daily') === '1');
		return Response.json(result);
	}
};
