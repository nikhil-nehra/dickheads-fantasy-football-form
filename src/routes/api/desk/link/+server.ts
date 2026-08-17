import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { setSleeperLink } from '$lib/server/db';

/**
 * Attach a roster player to a Sleeper account, or detach them.
 *
 * Needed because automatic matching cannot work in a league where nobody uses
 * their real name as a handle: pdande97, scomeaux11, LyanRatin, veansarg. The
 * Desk suggests, the commissioner decides, this endpoint records it.
 */
export const POST: RequestHandler = async ({ request, platform, locals }) => {
	if (!locals.isCommissioner) {
		return json({ error: 'forbidden', message: 'Commissioner only.' }, { status: 403 });
	}

	const db = platform!.env.DB;
	const body = (await request.json().catch(() => ({}))) as {
		playerId?: string;
		sleeperUserId?: string | null;
		rosterId?: number | null;
	};

	if (!body.playerId) return json({ error: 'bad_request' }, { status: 400 });

	const outcome = await setSleeperLink(
		db,
		body.playerId,
		body.sleeperUserId ? String(body.sleeperUserId) : null,
		typeof body.rosterId === 'number' ? body.rosterId : null,
		'commissioner'
	);

	if (outcome === 'unknown_player') {
		return json({ error: 'unknown_player', message: 'No such player.' }, { status: 404 });
	}

	if (outcome === 'taken') {
		return json(
			{
				error: 'already_linked',
				message: 'That Sleeper account is already attached to someone else.'
			},
			{ status: 409 }
		);
	}

	return json({ ok: true, outcome });
};
