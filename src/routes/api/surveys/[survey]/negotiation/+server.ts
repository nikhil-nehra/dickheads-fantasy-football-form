import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { surveyById } from '$lib/surveys';
import { allQuestions } from '$lib/surveys/types';
import { saveNegotiation, rateLimited } from '$lib/server/db';

const MAX_FIELD = 500;

export const POST: RequestHandler = async ({ params, request, platform, locals }) => {
	const def = surveyById(params.survey);
	if (!def) return json({ error: 'unknown_survey' }, { status: 404 });

	const negQ = allQuestions(def).find((q) => q.type === 'negotiation');
	if (!negQ || negQ.type !== 'negotiation') {
		return json({ error: 'no_negotiation' }, { status: 400 });
	}

	const db = platform!.env.DB;

	const body = (await request.json().catch(() => ({}))) as {
		pairingId?: string;
		playerId?: string;
		fieldKey?: string;
		proposal?: string | null;
		pick?: string | null;
	};

	if (!body.pairingId || !body.playerId) {
		return json({ error: 'bad_request' }, { status: 400 });
	}

	if (!negQ.fields.some((f) => f.key === body.fieldKey)) {
		return json({ error: 'unknown_field' }, { status: 400 });
	}

	const trim = (v: string | null | undefined) => {
		const t = (v ?? '').trim();
		return t.length ? t.slice(0, MAX_FIELD) : null;
	};

	if (await rateLimited(db, `neg:${body.playerId}`, 30, 60)) {
		return json({ error: 'rate_limited', message: 'Slow down a moment.' }, { status: 429 });
	}

	/* The statement behind this only touches the row keyed
	   (pairing, field, THIS player), and its WHERE clause requires that the
	   player actually belongs to the pairing. So you cannot write your rival's
	   side even by asking for it directly, and there is no shared row for the
	   two of you to race over. */
	const outcome = await saveNegotiation(
		db,
		def.id,
		{
			pairingId: body.pairingId,
			fieldKey: body.fieldKey!,
			playerId: body.playerId,
			proposal: trim(body.proposal),
			pick: trim(body.pick)
		},
		{ bypassStatus: locals.isCommissioner }
	);

	if (outcome === 'not_in_pairing') {
		return json(
			{ error: 'not_in_pairing', message: "That's not your rivalry." },
			{ status: 403 }
		);
	}

	if (outcome !== 'saved') {
		return json(
			{ error: 'survey_closed', message: 'That survey is closed. Answers are locked.' },
			{ status: 409 }
		);
	}

	return json({ ok: true });
};
