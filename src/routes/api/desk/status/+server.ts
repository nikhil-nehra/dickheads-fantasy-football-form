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

	// Opening a survey is the natural moment to pull its ballot pool forward
	// from whatever fed it.
	let ballotAdded = 0;
	if (body.status === 'open') {
		ballotAdded = await syncBallotOptions(db, def);
	}

	return json({ ok: true, ballotAdded });
};
