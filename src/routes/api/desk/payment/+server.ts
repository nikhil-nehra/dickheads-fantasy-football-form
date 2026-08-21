import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { setPayment } from '$lib/server/db';

/**
 * Mark one player paid or unpaid.
 *
 * One player per request. Posting the whole roster's state at once would be a
 * blob to read-modify-write, which is exactly the shape of the old site's worst
 * bug — two devices, and the later save silently reverts the earlier one.
 */
export const POST: RequestHandler = async ({ request, platform, locals }) => {
	if (!locals.isCommissioner) {
		return json({ error: 'forbidden', message: 'Commissioner only.' }, { status: 403 });
	}

	const db = platform!.env.DB;
	const season = platform!.env.SEASON ?? '2026';
	const body = (await request.json().catch(() => ({}))) as {
		playerId?: string;
		paid?: unknown;
	};

	if (!body.playerId || typeof body.playerId !== 'string') {
		return json({ error: 'bad_player' }, { status: 400 });
	}
	if (typeof body.paid !== 'boolean') {
		return json({ error: 'bad_paid', message: 'paid must be true or false.' }, { status: 400 });
	}

	const ok = await setPayment(db, season, body.playerId, body.paid, 'commissioner');
	if (!ok) return json({ error: 'unknown_player' }, { status: 404 });

	return json({ ok: true });
};
