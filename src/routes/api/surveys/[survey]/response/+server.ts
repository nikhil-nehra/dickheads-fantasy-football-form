import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { surveyById } from '$lib/surveys';
import { allQuestions } from '$lib/surveys/types';
import { validateResponse } from '$lib/surveys/validate';
import { listPlayers, listBallotOptions, saveResponse, rateLimited } from '$lib/server/db';

/** Bodies larger than this are not a survey response. */
const MAX_BODY = 64 * 1024;

export const POST: RequestHandler = async ({ params, request, platform, locals }) => {
	const def = surveyById(params.survey);
	if (!def) return json({ error: 'unknown_survey' }, { status: 404 });

	const db = platform!.env.DB;

	const raw = await request.text();
	if (raw.length > MAX_BODY) {
		return json({ error: 'too_large', message: 'That response is too big.' }, { status: 413 });
	}

	let body: { playerId?: unknown; answers?: unknown };
	try {
		body = JSON.parse(raw);
	} catch {
		return json({ error: 'bad_json', message: 'Malformed request.' }, { status: 400 });
	}

	const playerId = typeof body.playerId === 'string' ? body.playerId : '';
	if (!playerId) {
		return json({ error: 'no_player', message: 'Pick your name first.' }, { status: 400 });
	}

	// Per-player limit on top of the per-IP limit in hooks, so one player on a
	// shared network can't burn everyone else's budget.
	if (await rateLimited(db, `player:${playerId}`, 20, 60)) {
		return json(
			{ error: 'rate_limited', message: "That's a lot of saving. Give it a minute." },
			{ status: 429 }
		);
	}

	const players = await listPlayers(db);
	if (!players.some((p) => p.id === playerId)) {
		return json({ error: 'unknown_player', message: 'That name is not on the roster.' }, { status: 400 });
	}

	// Valid ballot option ids come from the database, so a podium can only ever
	// reference real options.
	const ballotOptions: Record<string, string[]> = {};
	for (const q of allQuestions(def)) {
		if (q.type !== 'ballot') continue;
		ballotOptions[q.id] = (await listBallotOptions(db, def.id, q.id)).map((o) => o.id);
	}

	const result = validateResponse(def, body.answers, {
		playerId,
		rosterIds: players.map((p) => p.id),
		ballotOptions
	});

	if (!result.ok) {
		return json({ error: 'invalid', errors: result.errors }, { status: 422 });
	}

	// The survey's status is re-checked INSIDE this write, so a survey that
	// closed mid-session rejects rather than races.
	const outcome = await saveResponse(db, def.id, playerId, result.value, {
		bypassStatus: locals.isCommissioner
	});

	if (outcome === 'survey_closed') {
		return json(
			{
				error: 'survey_closed',
				message: 'That survey is closed. Responses are locked.'
			},
			{ status: 409 }
		);
	}

	if (outcome === 'unknown_player') {
		return json({ error: 'unknown_player', message: 'That name is not on the roster.' }, { status: 400 });
	}

	return json({ ok: true });
};
