import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { setRuling, clearRuling } from '$lib/server/db';

const MAX = 500;

/** Force a stalled negotiation line. Upserts one row, so two rulings on the
    same pair can't clobber each other the way the old merged blob did. */
export const POST: RequestHandler = async ({ request, platform, locals }) => {
	if (!locals.isCommissioner) {
		return json({ error: 'forbidden', message: 'Commissioner only.' }, { status: 403 });
	}

	const db = platform!.env.DB;
	const body = (await request.json().catch(() => ({}))) as {
		pairingId?: string;
		fieldKey?: string;
		value?: string;
	};

	if (!body.pairingId || !body.fieldKey) {
		return json({ error: 'bad_request' }, { status: 400 });
	}

	// Check the pairing exists first. Without this, a stale or mistyped id hits
	// the foreign key and surfaces as an unhandled 500 rather than something
	// the Desk can show the commissioner.
	const pairing = await db
		.prepare('SELECT 1 AS x FROM pairing WHERE id = ?')
		.bind(body.pairingId)
		.first<{ x: number }>();

	if (!pairing) {
		return json(
			{ error: 'unknown_pairing', message: 'That rivalry no longer exists.' },
			{ status: 404 }
		);
	}

	const value = (body.value ?? '').trim();

	// An empty value withdraws the ruling and hands the decision back.
	if (!value) {
		await clearRuling(db, body.pairingId, body.fieldKey, 'commissioner');
		return json({ ok: true, cleared: true });
	}

	await setRuling(db, body.pairingId, body.fieldKey, value.slice(0, MAX), 'commissioner');
	return json({ ok: true });
};
