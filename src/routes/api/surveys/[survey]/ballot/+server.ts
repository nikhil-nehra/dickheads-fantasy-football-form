import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { surveyById } from '$lib/surveys';
import { allQuestions } from '$lib/surveys/types';
import { ensureBallotOption, listSurveyStates, rateLimited, getPlayer } from '$lib/server/db';
import { isOpen } from '$lib/status';

/**
 * Adds a write-in to the shared ballot pool.
 *
 * A duplicate returns the EXISTING option's id rather than creating a second
 * row — de-duplication is the UNIQUE constraint on normalised text, so two
 * people writing "loser shaves his head" land on one option, not two.
 */
export const POST: RequestHandler = async ({ params, request, platform, locals }) => {
	const def = surveyById(params.survey);
	if (!def) return json({ error: 'unknown_survey' }, { status: 404 });

	const db = platform!.env.DB;

	const body = (await request.json().catch(() => ({}))) as {
		questionId?: string;
		text?: string;
		playerId?: string;
	};

	const q = allQuestions(def).find((x) => x.id === body.questionId && x.type === 'ballot');
	if (!q || q.type !== 'ballot' || !q.writeIn) {
		return json({ error: 'unknown_question' }, { status: 400 });
	}

	const text = (body.text ?? '').trim();
	if (!text) return json({ error: 'empty' }, { status: 400 });
	if (text.length > (q.writeIn.maxLength ?? 400)) {
		return json({ error: 'too_long', message: 'That write-in is too long.' }, { status: 422 });
	}

	// Writing to the shared pool is a write, so it obeys the same status gate
	// as a response.
	const states = await listSurveyStates(db);
	if (!isOpen(states[def.id]?.status) && !locals.isCommissioner) {
		return json(
			{ error: 'survey_closed', message: 'That survey is closed.' },
			{ status: 409 }
		);
	}

	const playerId = body.playerId ?? null;
	if (playerId && !(await getPlayer(db, playerId))) {
		return json({ error: 'unknown_player' }, { status: 400 });
	}

	if (await rateLimited(db, `ballot:${playerId ?? 'anon'}`, 10, 60)) {
		return json({ error: 'rate_limited', message: 'Slow down a moment.' }, { status: 429 });
	}

	const id = await ensureBallotOption(db, {
		surveyId: def.id,
		questionId: q.id,
		text,
		source: 'writein',
		suggestedBy: playerId
	});

	return json({ id });
};
