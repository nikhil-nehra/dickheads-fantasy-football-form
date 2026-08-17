/* ═══════════════════════════════════════════════════════════════════════════
   REQUEST GATE
   ═══════════════════════════════════════════════════════════════════════════
   Players are identified by a name dropdown — an honour system, deliberately,
   because this is a 14-person friends' league and a login wall would kill
   participation. That choice means the write endpoint cannot verify WHO is
   writing, so it has to be strict about everything else:

     · the request must come from this site (same origin),
     · at a sane rate,
     · with a body this survey's definition actually accepts,
     · while the survey is open — checked inside the write itself.

   The old backend enforced none of these. Its `/exec` URL was public,
   unauthenticated, unthrottled, and accepted any key that didn't match a
   known prefix, so anyone could append unlimited rows to the commissioner's
   spreadsheet. Sending JSON as `text/plain` to dodge CORS preflight (a
   necessity when the site and API were on different origins) also made every
   write forgeable from any page on the internet. One origin fixes that class
   outright.
   ═══════════════════════════════════════════════════════════════════════════ */

import type { Handle } from '@sveltejs/kit';
import { isCommissioner } from '$lib/server/auth';
import { rateLimited } from '$lib/server/db';

const MUTATIONS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Requests per window, per client IP. Generous for humans, useless for loops.
 * Overridable so the end-to-end suite — which is a loop, and a legitimate one —
 * can exercise the real code path without fighting it. The per-player and
 * per-PIN buckets below are NOT overridable.
 */
const DEFAULT_RATE_LIMIT = 40;
const RATE_WINDOW_SECONDS = 60;

function json(body: unknown, status: number): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { 'content-type': 'application/json' }
	});
}

export const handle: Handle = async ({ event, resolve }) => {
	const { platform, request, url, cookies } = event;

	event.locals.isCommissioner = await isCommissioner(cookies, platform?.env.COMMISH_PIN);

	if (MUTATIONS.has(request.method)) {
		// ── Same-origin only ────────────────────────────────────────────────
		// Sec-Fetch-Site is sent by every current browser and is not settable
		// by script; Origin is the fallback for anything older.
		const site = request.headers.get('sec-fetch-site');
		const origin = request.headers.get('origin');
		const sameOrigin = site
			? site === 'same-origin' || site === 'none'
			: origin === url.origin;

		if (!sameOrigin) {
			return json({ error: 'bad_origin', message: 'Cross-site writes are not allowed.' }, 403);
		}

		// ── Rate limit ──────────────────────────────────────────────────────
		const db = platform?.env.DB;
		if (db) {
			const ip =
				request.headers.get('cf-connecting-ip') ??
				request.headers.get('x-forwarded-for') ??
				'unknown';
			const limit = Number(platform?.env.RATE_LIMIT_PER_MIN) || DEFAULT_RATE_LIMIT;
			if (await rateLimited(db, `ip:${ip}`, limit, RATE_WINDOW_SECONDS)) {
				return json(
					{
						error: 'rate_limited',
						message: "That's a lot of saving. Give it a minute and try again."
					},
					429
				);
			}
		}
	}

	const response = await resolve(event);

	// Nothing here is worth embedding, and nothing loads third-party code.
	response.headers.set('X-Frame-Options', 'DENY');
	response.headers.set('X-Content-Type-Options', 'nosniff');
	response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');

	return response;
};
