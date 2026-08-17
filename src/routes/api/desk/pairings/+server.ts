import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { replacePairings, listPlayers, listPairings } from '$lib/server/db';

export const POST: RequestHandler = async ({ request, platform, locals }) => {
	if (!locals.isCommissioner) {
		return json({ error: 'forbidden', message: 'Commissioner only.' }, { status: 403 });
	}

	const db = platform!.env.DB;
	const season = platform!.env.SEASON ?? '2026';

	const body = (await request.json().catch(() => ({}))) as {
		pairs?: [string, string][];
		source?: 'manual' | 'sleeper' | 'auto';
	};

	const pairs = Array.isArray(body.pairs) ? body.pairs : [];
	const roster = new Set((await listPlayers(db)).map((p) => p.id));

	for (const pair of pairs) {
		if (!Array.isArray(pair) || pair.length !== 2) {
			return json({ error: 'bad_pairs' }, { status: 400 });
		}
		if (!roster.has(pair[0]) || !roster.has(pair[1])) {
			return json({ error: 'unknown_player', message: 'A pairing names someone off the roster.' }, { status: 400 });
		}
		if (pair[0] === pair[1]) {
			return json({ error: 'self_pair' }, { status: 400 });
		}
	}

	// The UNIQUE(season, player) constraints reject anyone appearing twice, so
	// a bad set fails loudly instead of half-applying.
	try {
		await replacePairings(db, season, pairs, body.source ?? 'manual', 'commissioner');
	} catch {
		return json(
			{ error: 'duplicate_player', message: 'Someone appears in more than one pairing.' },
			{ status: 409 }
		);
	}

	// Return the created rows so the caller has their ids without a second
	// round trip — the Desk uses them to address rulings.
	const created = await listPairings(db, season);
	return json({
		ok: true,
		count: pairs.length,
		pairings: created.map((p) => ({ id: p.id, a: p.a_player_id, b: p.b_player_id }))
	});
};
