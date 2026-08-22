import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { setSurveyStatus, type SurveyStatus } from '$lib/server/db';
import { syncBallotOptions } from '$lib/server/ballot';
import { surveyById } from '$lib/surveys';
import { ALL_STATUSES } from '$lib/status';

export const POST: RequestHandler = async ({ request, platform, locals }) => {
	if (!locals.isCommissioner) {
		return json({ error: 'forbidden', message: 'Commissioner only.' }, { status: 403 });
	}

	const db = platform!.env.DB;
	const body = (await request.json().catch(() => ({}))) as {
		surveyId?: string;
		status?: string;
	};

	const def = body.surveyId ? surveyById(body.surveyId) : undefined;
	if (!def) return json({ error: 'unknown_survey' }, { status: 404 });

	if (!ALL_STATUSES.includes(body.status as SurveyStatus)) {
		return json({ error: 'bad_status' }, { status: 400 });
	}

	/* One UPDATE. The old Desk read the whole status map into memory at boot,
	   mutated its local copy and POSTed the entire blob back — so two tabs,
	   two devices, or one stale tab would silently revert another survey's
	   status. There is no blob to clobber here. */
	const changed = await setSurveyStatus(db, def.id, body.status as SurveyStatus, 'commissioner');
	if (!changed) return json({ error: 'unknown_survey' }, { status: 404 });

	/* Opening a survey is the natural moment to pull its ballot pool forward
	   from whatever fed it — and, now, to take the superseded shortlist back
	   off. `kept` is the one part worth surfacing: those are options the
	   commissioner has cut that somebody has already ranked, so they stay on
	   the ballot and the Desk should say so rather than let them look like a
	   sync that failed. */
	let ballot = { added: 0, removed: 0, kept: [] as string[] };
	if (body.status === 'open') {
		ballot = await syncBallotOptions(db, def);
	}

	return json({ ok: true, ballotAdded: ballot.added, ballot });
};
