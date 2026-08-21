/* ═══════════════════════════════════════════════════════════════════════════
   THE STORE
   ═══════════════════════════════════════════════════════════════════════════
   Every mutation here is a SINGLE statement. That is deliberate.

   The old site's two worst bugs were both read-modify-write races run from a
   browser: `meta:status` was a JSON blob the Desk read once at boot and
   rewrote wholesale (so two tabs silently reverted each other), and rulings
   merged onto stale local state the same way. A script lock could not help,
   because the conflicting read had happened minutes earlier on someone's
   phone.

   Writing the status check INTO the write statement means the check and the
   write cannot be separated by time, a network, or a stale tab.
   ═══════════════════════════════════════════════════════════════════════════ */

export type SurveyStatus = 'draft' | 'open' | 'closed' | 'archived';

export type Player = {
	id: string;
	display_name: string;
	sleeper_user_id: string | null;
	sleeper_roster_id: number | null;
	is_commissioner: number;
	active: number;
	sort_order: number;
};

export type SurveyState = {
	id: string;
	status: SurveyStatus;
	closes_at: string | null;
	changed_at: string;
	changed_by: string | null;
};

export type ResponseRow = {
	survey_id: string;
	player_id: string;
	answers: string;
	created_at: string;
	updated_at: string;
};

export type BallotOptionRow = {
	id: string;
	survey_id: string;
	question_id: string;
	text: string;
	norm_text: string;
	source: 'commissioner' | 'imported' | 'writein';
	suggested_by: string | null;
};

export type PairingRow = {
	id: string;
	season: string;
	a_player_id: string;
	b_player_id: string;
	source: 'manual' | 'sleeper' | 'auto';
};

export type NegotiationRow = {
	pairing_id: string;
	field_key: string;
	player_id: string;
	proposal: string | null;
	pick: string | null;
	updated_at: string;
};

export type RulingRow = {
	pairing_id: string;
	field_key: string;
	value: string;
	created_at: string;
};

/** Statuses that accept writes. Deliberately a one-element list. */
export const WRITABLE: SurveyStatus[] = ['open'];

// Re-exported so server callers can reach it from one place, and imported so
// this module can use it too — a bare re-export does not bind the name here.
import { norm } from '../text';
export { norm };

import { EMPTY_POT, parsePot, type PaymentRow, type PotConfig } from '../pot';

/* ── Players ─────────────────────────────────────────────────────────────── */

export async function listPlayers(db: D1Database, includeInactive = false): Promise<Player[]> {
	const sql = includeInactive
		? 'SELECT * FROM player ORDER BY sort_order, display_name'
		: 'SELECT * FROM player WHERE active = 1 ORDER BY sort_order, display_name';
	const { results } = await db.prepare(sql).all<Player>();
	return results;
}

export async function getPlayer(db: D1Database, id: string): Promise<Player | null> {
	return db.prepare('SELECT * FROM player WHERE id = ?').bind(id).first<Player>();
}

/**
 * Point a roster player at a Sleeper account, or clear the link.
 *
 * Unlike the sync worker's automatic pass, this OVERWRITES whatever is there —
 * it is the commissioner saying so explicitly. The UNIQUE constraint on
 * `sleeper_user_id` stops the same account being attached to two players, so a
 * mistake fails loudly instead of quietly crediting someone else's results.
 */
export async function setSleeperLink(
	db: D1Database,
	playerId: string,
	sleeperUserId: string | null,
	rosterId: number | null,
	actor: string
): Promise<'linked' | 'unlinked' | 'taken' | 'unknown_player'> {
	if (!(await getPlayer(db, playerId))) return 'unknown_player';

	if (!sleeperUserId) {
		await db
			.prepare(
				'UPDATE player SET sleeper_user_id = NULL, sleeper_roster_id = NULL WHERE id = ?'
			)
			.bind(playerId)
			.run();
		await audit(db, actor, 'sleeper.unlink', playerId);
		return 'unlinked';
	}

	try {
		await db
			.prepare('UPDATE player SET sleeper_user_id = ?2, sleeper_roster_id = ?3 WHERE id = ?1')
			.bind(playerId, sleeperUserId, rosterId)
			.run();
	} catch {
		return 'taken';
	}

	await audit(db, actor, 'sleeper.link', `${playerId} -> ${sleeperUserId}`);
	return 'linked';
}

/* ── Survey state ────────────────────────────────────────────────────────── */

export async function listSurveyStates(db: D1Database): Promise<Record<string, SurveyState>> {
	const { results } = await db.prepare('SELECT * FROM survey').all<SurveyState>();
	return Object.fromEntries(results.map((r) => [r.id, r]));
}

/**
 * Set a survey's status. One statement, so concurrent Desk sessions can never
 * revert each other — the failure mode that made the old blob-based status
 * map unsafe with two tabs open.
 */
export async function setSurveyStatus(
	db: D1Database,
	surveyId: string,
	status: SurveyStatus,
	actor: string
): Promise<boolean> {
	const res = await db
		.prepare(
			`UPDATE survey
			    SET status = ?2, changed_at = datetime('now'), changed_by = ?3
			  WHERE id = ?1`
		)
		.bind(surveyId, status, actor)
		.run();
	if (res.meta.changes > 0) {
		await audit(db, actor, 'survey.status', `${surveyId} → ${status}`);
	}
	return res.meta.changes > 0;
}

/** Ensure every registered survey has a state row. Safe to run on every boot. */
export async function ensureSurveys(db: D1Database, ids: string[]): Promise<void> {
	if (!ids.length) return;
	await db.batch(
		ids.map((id) =>
			db.prepare("INSERT INTO survey (id, status) VALUES (?, 'draft') ON CONFLICT(id) DO NOTHING").bind(id)
		)
	);
}

/* ── Responses ───────────────────────────────────────────────────────────── */

export async function getResponse(
	db: D1Database,
	surveyId: string,
	playerId: string
): Promise<ResponseRow | null> {
	return db
		.prepare('SELECT * FROM response WHERE survey_id = ? AND player_id = ?')
		.bind(surveyId, playerId)
		.first<ResponseRow>();
}

export async function listResponses(db: D1Database, surveyId: string): Promise<ResponseRow[]> {
	const { results } = await db
		.prepare(
			`SELECT r.* FROM response r
			   JOIN player p ON p.id = r.player_id
			  WHERE r.survey_id = ? AND p.active = 1`
		)
		.bind(surveyId)
		.all<ResponseRow>();
	return results;
}

/** Real per-survey counts. The old hub hardcoded two survey ids and showed
    any third survey as 0/14 forever. */
export async function responseCounts(db: D1Database): Promise<Record<string, number>> {
	const { results } = await db
		.prepare(
			`SELECT r.survey_id AS id, COUNT(*) AS n
			   FROM response r JOIN player p ON p.id = r.player_id
			  WHERE p.active = 1
			  GROUP BY r.survey_id`
		)
		.all<{ id: string; n: number }>();
	return Object.fromEntries(results.map((r) => [r.id, r.n]));
}

export type SaveOutcome = 'saved' | 'survey_closed' | 'unknown_player' | 'not_in_pairing';

/**
 * Upsert a response, with the survey's status checked INSIDE the write.
 *
 * `WHERE EXISTS (… status = 'open')` is the whole point: there is no window
 * between reading the status and committing the answer, so a survey that
 * closes mid-session rejects the write rather than racing it.
 */
export async function saveResponse(
	db: D1Database,
	surveyId: string,
	playerId: string,
	answers: unknown,
	opts: { bypassStatus?: boolean } = {}
): Promise<SaveOutcome> {
	const gate = opts.bypassStatus
		? '1 = 1'
		: `EXISTS (SELECT 1 FROM survey s WHERE s.id = ?1 AND s.status IN ('open'))`;

	const res = await db
		.prepare(
			`INSERT INTO response (survey_id, player_id, answers, created_at, updated_at)
			 SELECT ?1, ?2, ?3, datetime('now'), datetime('now')
			  WHERE ${gate}
			    AND EXISTS (SELECT 1 FROM player p WHERE p.id = ?2 AND p.active = 1)
			 ON CONFLICT(survey_id, player_id)
			 DO UPDATE SET answers = excluded.answers, updated_at = datetime('now')`
		)
		.bind(surveyId, playerId, JSON.stringify(answers))
		.run();

	if (res.meta.changes > 0) return 'saved';

	// Nothing was written — work out which gate stopped it, for a real message.
	const player = await getPlayer(db, playerId);
	if (!player || !player.active) return 'unknown_player';
	return 'survey_closed';
}

/* ── Ballot options ──────────────────────────────────────────────────────── */

export async function listBallotOptions(
	db: D1Database,
	surveyId: string,
	questionId: string
): Promise<BallotOptionRow[]> {
	const { results } = await db
		.prepare(
			`SELECT * FROM ballot_option
			  WHERE survey_id = ? AND question_id = ?
			  ORDER BY CASE source WHEN 'commissioner' THEN 0 WHEN 'imported' THEN 1 ELSE 2 END,
			           created_at`
		)
		.bind(surveyId, questionId)
		.all<BallotOptionRow>();
	return results;
}

/**
 * Add an option to the pool if its normalised text is new, and return its id
 * either way. De-duplication is the UNIQUE constraint's job.
 *
 * Ids are random and opaque: the old site derived them from the option text,
 * so editing a punishment silently invalidated every ranking pointing at it.
 */
export async function ensureBallotOption(
	db: D1Database,
	opt: {
		surveyId: string;
		questionId: string;
		text: string;
		source: BallotOptionRow['source'];
		suggestedBy?: string | null;
	}
): Promise<string | null> {
	const text = opt.text.trim();
	if (!text) return null;
	const n = norm(text);
	const id = crypto.randomUUID();

	await db
		.prepare(
			`INSERT INTO ballot_option (id, survey_id, question_id, text, norm_text, source, suggested_by)
			 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
			 ON CONFLICT(survey_id, question_id, norm_text) DO NOTHING`
		)
		.bind(id, opt.surveyId, opt.questionId, text, n, opt.source, opt.suggestedBy ?? null)
		.run();

	const row = await db
		.prepare(
			'SELECT id FROM ballot_option WHERE survey_id = ? AND question_id = ? AND norm_text = ?'
		)
		.bind(opt.surveyId, opt.questionId, n)
		.first<{ id: string }>();
	return row?.id ?? null;
}

/* ── The pot ─────────────────────────────────────────────────────────────── */

/**
 * The buy-in and split for a season. An absent row means "not decided yet",
 * which the board renders as such rather than as a $0 pot.
 */
export async function getPotConfig(db: D1Database, season: string): Promise<PotConfig> {
	const row = await db
		.prepare('SELECT buy_in, split FROM pot_config WHERE season = ?')
		.bind(season)
		.first<{ buy_in: number; split: string }>();
	return row ? parsePot(row.buy_in, row.split) : EMPTY_POT;
}

/** One upsert, like every other mutation here — nothing to read-modify-write. */
export async function setPotConfig(
	db: D1Database,
	season: string,
	config: PotConfig,
	by: string
): Promise<void> {
	await db
		.prepare(
			`INSERT INTO pot_config (season, buy_in, split, updated_at, updated_by)
			 VALUES (?1, ?2, ?3, datetime('now'), ?4)
			 ON CONFLICT(season) DO UPDATE SET
			   buy_in     = excluded.buy_in,
			   split      = excluded.split,
			   updated_at = excluded.updated_at,
			   updated_by = excluded.updated_by`
		)
		.bind(season, config.buyIn, JSON.stringify(config.split), by)
		.run();
}

/** Who has paid this season. A missing row is "not paid" — nothing to seed. */
export async function listPayments(db: D1Database, season: string): Promise<PaymentRow[]> {
	const { results } = await db
		.prepare('SELECT player_id, paid FROM payment WHERE season = ?')
		.bind(season)
		.all<PaymentRow>();
	return results;
}

/**
 * Mark one player paid or unpaid.
 *
 * One upsert for one player, so marking two people paid from two devices does
 * not involve a shared blob one of them would clobber. Returns false when the
 * player id is not on the roster, which the endpoint reports rather than
 * writing an orphan row a foreign key would only catch at the next migration.
 */
export async function setPayment(
	db: D1Database,
	season: string,
	playerId: string,
	paid: boolean,
	by: string
): Promise<boolean> {
	const player = await db
		.prepare('SELECT id FROM player WHERE id = ?')
		.bind(playerId)
		.first<{ id: string }>();
	if (!player) return false;

	await db
		.prepare(
			`INSERT INTO payment (season, player_id, paid, marked_at, marked_by)
			 VALUES (?1, ?2, ?3, datetime('now'), ?4)
			 ON CONFLICT(season, player_id) DO UPDATE SET
			   paid      = excluded.paid,
			   marked_at = excluded.marked_at,
			   marked_by = excluded.marked_by`
		)
		.bind(season, playerId, paid ? 1 : 0, by)
		.run();

	await audit(db, by, paid ? 'pot.paid' : 'pot.unpaid', playerId);
	return true;
}

/* ── Pairings and negotiation ────────────────────────────────────────────── */

export async function listPairings(db: D1Database, season: string): Promise<PairingRow[]> {
	const { results } = await db
		.prepare('SELECT * FROM pairing WHERE season = ? ORDER BY created_at')
		.bind(season)
		.all<PairingRow>();
	return results;
}

export async function pairingFor(
	db: D1Database,
	season: string,
	playerId: string
): Promise<PairingRow | null> {
	return db
		.prepare(
			'SELECT * FROM pairing WHERE season = ? AND (a_player_id = ? OR b_player_id = ?)'
		)
		.bind(season, playerId, playerId)
		.first<PairingRow>();
}

export async function listNegotiation(
	db: D1Database,
	pairingIds: string[]
): Promise<NegotiationRow[]> {
	if (!pairingIds.length) return [];
	const placeholders = pairingIds.map(() => '?').join(',');
	const { results } = await db
		.prepare(`SELECT * FROM negotiation_entry WHERE pairing_id IN (${placeholders})`)
		.bind(...pairingIds)
		.all<NegotiationRow>();
	return results;
}

/**
 * Write one player's side of one negotiation line.
 *
 * The primary key is (pairing, field, player), so this can only ever touch
 * the caller's own row. There is no contended row and therefore no race —
 * the property the old implementation achieved by convention and documented
 * carefully, now guaranteed by the schema.
 */
export async function saveNegotiation(
	db: D1Database,
	surveyId: string,
	entry: {
		pairingId: string;
		fieldKey: string;
		playerId: string;
		proposal: string | null;
		pick: string | null;
	},
	opts: { bypassStatus?: boolean } = {}
): Promise<SaveOutcome> {
	const gate = opts.bypassStatus
		? '1 = 1'
		: `EXISTS (SELECT 1 FROM survey s WHERE s.id = ?6 AND s.status IN ('open'))`;

	const res = await db
		.prepare(
			`INSERT INTO negotiation_entry (pairing_id, field_key, player_id, proposal, pick, updated_at)
			 SELECT ?1, ?2, ?3, ?4, ?5, datetime('now')
			  WHERE ${gate}
			    AND EXISTS (SELECT 1 FROM pairing p
			                 WHERE p.id = ?1 AND (p.a_player_id = ?3 OR p.b_player_id = ?3))
			 ON CONFLICT(pairing_id, field_key, player_id)
			 DO UPDATE SET proposal = excluded.proposal,
			               pick     = excluded.pick,
			               updated_at = datetime('now')`
		)
		.bind(
			entry.pairingId,
			entry.fieldKey,
			entry.playerId,
			entry.proposal,
			entry.pick,
			surveyId
		)
		.run();

	if (res.meta.changes > 0) return 'saved';

	// Nothing was written. Work out which of the two gates stopped it so the
	// caller can say something true rather than guessing.
	const inPair = await db
		.prepare(
			'SELECT 1 AS x FROM pairing WHERE id = ? AND (a_player_id = ? OR b_player_id = ?)'
		)
		.bind(entry.pairingId, entry.playerId, entry.playerId)
		.first<{ x: number }>();

	return inPair ? 'survey_closed' : 'not_in_pairing';
}

export async function listRulings(db: D1Database): Promise<RulingRow[]> {
	const { results } = await db.prepare('SELECT * FROM ruling').all<RulingRow>();
	return results;
}

export async function setRuling(
	db: D1Database,
	pairingId: string,
	fieldKey: string,
	value: string,
	actor: string
): Promise<void> {
	await db
		.prepare(
			`INSERT INTO ruling (pairing_id, field_key, value, created_at)
			 VALUES (?1, ?2, ?3, datetime('now'))
			 ON CONFLICT(pairing_id, field_key)
			 DO UPDATE SET value = excluded.value, created_at = datetime('now')`
		)
		.bind(pairingId, fieldKey, value)
		.run();
	await audit(db, actor, 'ruling.set', `${pairingId}/${fieldKey} = ${value}`);
}

export async function clearRuling(
	db: D1Database,
	pairingId: string,
	fieldKey: string,
	actor: string
): Promise<void> {
	await db
		.prepare('DELETE FROM ruling WHERE pairing_id = ? AND field_key = ?')
		.bind(pairingId, fieldKey)
		.run();
	await audit(db, actor, 'ruling.clear', `${pairingId}/${fieldKey}`);
}

/** Replace the season's pairings atomically. */
export async function replacePairings(
	db: D1Database,
	season: string,
	pairs: [string, string][],
	source: PairingRow['source'],
	actor: string
): Promise<void> {
	await db.batch([
		db.prepare('DELETE FROM pairing WHERE season = ?').bind(season),
		...pairs.map(([a, b]) =>
			db
				.prepare(
					'INSERT INTO pairing (id, season, a_player_id, b_player_id, source) VALUES (?,?,?,?,?)'
				)
				.bind(crypto.randomUUID(), season, a, b, source)
		)
	]);
	await audit(db, actor, 'pairings.replace', `${pairs.length} pairs (${source})`);
}

/* ── Audit ───────────────────────────────────────────────────────────────── */

export async function audit(
	db: D1Database,
	actor: string,
	action: string,
	detail: string
): Promise<void> {
	await db
		.prepare('INSERT INTO audit_log (actor, action, detail) VALUES (?,?,?)')
		.bind(actor, action, detail)
		.run();
}

export async function recentAudit(db: D1Database, limit = 50) {
	const { results } = await db
		.prepare('SELECT * FROM audit_log ORDER BY id DESC LIMIT ?')
		.bind(limit)
		.all<{ id: number; at: string; actor: string; action: string; detail: string }>();
	return results;
}

/* ── Rate limiting ───────────────────────────────────────────────────────── */

/**
 * Fixed-window counter. Returns true when the caller is over the limit.
 * The old public endpoint had none at all, so anyone with the URL could
 * append unlimited rows to the commissioner's spreadsheet.
 */
export async function rateLimited(
	db: D1Database,
	key: string,
	limit: number,
	windowSeconds: number,
	now = Date.now()
): Promise<boolean> {
	const window = Math.floor(now / 1000 / windowSeconds);
	const bucket = `${key}:${window}`;
	const expires = (window + 1) * windowSeconds;

	const row = await db
		.prepare(
			`INSERT INTO rate_limit (bucket, hits, expires_at) VALUES (?1, 1, ?2)
			 ON CONFLICT(bucket) DO UPDATE SET hits = hits + 1
			 RETURNING hits`
		)
		.bind(bucket, expires)
		.first<{ hits: number }>();

	return (row?.hits ?? 1) > limit;
}

export async function purgeRateLimits(db: D1Database, now = Date.now()): Promise<void> {
	await db
		.prepare('DELETE FROM rate_limit WHERE expires_at < ?')
		.bind(Math.floor(now / 1000))
		.run();
}
