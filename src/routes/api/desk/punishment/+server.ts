import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { setPunishment, audit } from '$lib/server/db';
import { parseRuling } from '$lib/punishment';

/**
 * Set the season's punishment ruling.
 *
 * There is nothing here that can be invalid — four pieces of free text a
 * commissioner typed — so this normalises rather than validates: trimmed,
 * capped, and a blank deadline falling back to the one the league already
 * agreed. What it does NOT do is check the ballot: the vote advises, and a
 * commissioner who rules against it is exercising the job, not making a
 * mistake for an endpoint to catch.
 */
export const POST: RequestHandler = async ({ request, platform, locals }) => {
	if (!locals.isCommissioner) {
		return json({ error: 'forbidden', message: 'Commissioner only.' }, { status: 403 });
	}

	const db = platform!.env.DB;
	const season = platform!.env.SEASON ?? '2026';
	const body = await request.json().catch(() => ({}));

	const ruling = parseRuling(body as Record<string, string>);

	await setPunishment(db, season, ruling, 'commissioner');
	await audit(
		db,
		'commissioner',
		'punishment.set',
		ruling.punishment ? `${ruling.punishment.slice(0, 60)} · by ${ruling.deadline}` : 'cleared'
	);

	return json({ ok: true, ruling });
};
