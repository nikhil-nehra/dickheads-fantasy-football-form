import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { surveyById } from '$lib/surveys';
import { allQuestions } from '$lib/surveys/types';
import { saveNegotiation, rateLimited } from '$lib/server/db';
import { normaliseMoney } from '$lib/money';
import { normaliseHex } from '$lib/color';
import { NONE, isNone } from '$lib/negotiation';

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

	const field = negQ.fields.find((f) => f.key === body.fieldKey);
	if (!field) {
		return json({ error: 'unknown_field' }, { status: 400 });
	}

	const trim = (v: string | null | undefined) => {
		const t = (v ?? '').trim();
		return t.length ? t.slice(0, MAX_FIELD) : null;
	};

	/* A money line is normalised to one canonical string before it is stored.
	   Agreement on a line is derived by comparing the two sides' answers, so
	   without this one player typing "20" and the other "$20" would disagree
	   forever about a number they had both already agreed on.

	   A colour is normalised for the same reason one step removed: nothing
	   compares the two SIDES of a colour line, but the swatch grid compares the
	   stored value against each swatch to show you which one you picked, and
	   the header asks whether the two teams landed on the same colour. Store
	   "#B3122F" and both of those quietly answer no. */
	const clean = (v: string | null | undefined) => {
		const t = trim(v);
		if (t === null) return t;
		if (field.kind === 'color') return normaliseHex(t);
		// "There isn't one" is a settled answer on any line, including a money
		// line, so it is canonicalised rather than validated as an amount.
		if (isNone(t)) return NONE;
		if (field.kind !== 'money') return t;
		return normaliseMoney(t);
	};

	if (field.kind === 'money') {
		for (const v of [body.proposal, body.pick]) {
			const t = trim(v);
			if (t !== null && !isNone(t) && normaliseMoney(t) === null) {
				return json(
					{
						error: 'not_money',
						message: `${field.short} is a dollar amount. Put anything the loser has to DO in the side forfeit.`
					},
					{ status: 422 }
				);
			}
		}
	}

	/* A colour line has no "there isn't one": every team has colours, the board
	   draws with them either way, and NONE would be stored as the literal string
	   "None" and then fail to parse as a colour every time it was read. */
	if (field.kind === 'color') {
		for (const v of [body.proposal, body.pick]) {
			const t = trim(v);
			if (t !== null && normaliseHex(t) === null) {
				return json(
					{
						error: 'not_color',
						message: `${field.short} has to be a colour — pick a swatch, or type a hex like #b91932.`
					},
					{ status: 422 }
				);
			}
		}
	}

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
			proposal: clean(body.proposal),
			pick: clean(body.pick)
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
