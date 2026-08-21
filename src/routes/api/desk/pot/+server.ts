import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { setPotConfig, audit } from '$lib/server/db';
import { validatePot } from '$lib/pot';

/**
 * Set the buy-in and the payout split.
 *
 * Validated with the same function the Desk uses to light up its own fields,
 * so a split that does not total 100% cannot be talked past by posting
 * directly — the client-side check is the courtesy, this is the rule.
 */
export const POST: RequestHandler = async ({ request, platform, locals }) => {
	if (!locals.isCommissioner) {
		return json({ error: 'forbidden', message: 'Commissioner only.' }, { status: 403 });
	}

	const db = platform!.env.DB;
	const season = platform!.env.SEASON ?? '2026';
	const body = await request.json().catch(() => ({}));

	const checked = validatePot(body);
	if (!checked.ok) {
		return json({ error: 'invalid', problems: checked.problems }, { status: 422 });
	}

	await setPotConfig(db, season, checked.value, 'commissioner');
	await audit(
		db,
		'commissioner',
		'pot.set',
		`$${checked.value.buyIn} buy-in, ${checked.value.split.length} slice(s)`
	);

	return json({ ok: true, pot: checked.value });
};
