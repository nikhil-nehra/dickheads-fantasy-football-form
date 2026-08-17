import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { pinMatches, startSession, endSession } from '$lib/server/auth';
import { rateLimited, audit } from '$lib/server/db';

/**
 * Exchange the PIN for a session cookie.
 *
 * The PIN is a Worker secret and is never sent to the browser, so unlike the
 * old site there is nothing to find in view-source, in the README, or in git
 * history. Attempts are throttled hard, which matters: a 4-digit PIN is only
 * 10,000 guesses against an unthrottled endpoint.
 */
export const POST: RequestHandler = async ({ request, cookies, platform }) => {
	const db = platform!.env.DB;
	const secret = platform!.env.COMMISH_PIN;

	const ip = request.headers.get('cf-connecting-ip') ?? 'unknown';
	if (await rateLimited(db, `pin:${ip}`, 8, 300)) {
		return json(
			{ error: 'rate_limited', message: 'Too many tries. Wait five minutes.' },
			{ status: 429 }
		);
	}

	const body = (await request.json().catch(() => ({}))) as { pin?: unknown };

	if (!secret) {
		// Fail closed rather than open when the deployment is misconfigured.
		return json(
			{ error: 'not_configured', message: 'No PIN is set on this deployment.' },
			{ status: 503 }
		);
	}

	if (!pinMatches(body.pin, secret)) {
		await audit(db, `ip:${ip}`, 'desk.login.fail', '');
		return json({ error: 'bad_pin', message: "That's not it." }, { status: 401 });
	}

	await startSession(cookies, secret);
	await audit(db, `ip:${ip}`, 'desk.login', '');
	return json({ ok: true });
};

export const DELETE: RequestHandler = async ({ cookies }) => {
	endSession(cookies);
	return json({ ok: true });
};
