/* ═══════════════════════════════════════════════════════════════════════════
   COMMISSIONER SESSIONS
   ═══════════════════════════════════════════════════════════════════════════
   The PIN pad UX is unchanged — it was good. What changed is where the PIN
   lives.

   Old:  COMMISH_PIN = '7531' in league.js (served to every visitor), printed
         in the README, and permanent in git history. The server compared it
         too, so it wasn't decorative — but it was public.

   New:  a Worker secret (`wrangler secret put COMMISH_PIN`). It never reaches
         the browser. The browser posts a candidate; the server compares in
         constant time and hands back a signed, httpOnly, SameSite=Strict
         cookie. The PIN itself is never stored client-side.
   ═══════════════════════════════════════════════════════════════════════════ */

import type { Cookies } from '@sveltejs/kit';

const COOKIE = 'commish';
const TTL_SECONDS = 60 * 60 * 12; // a long commissioning session, not forever
const enc = new TextEncoder();

/** Comparison whose duration does not depend on where the first difference is. */
export function timingSafeEqual(a: string, b: string): boolean {
	const ab = enc.encode(a);
	const bb = enc.encode(b);
	// Fold the length difference in rather than returning early on it.
	let diff = ab.length ^ bb.length;
	const n = Math.max(ab.length, bb.length);
	for (let i = 0; i < n; i++) {
		diff |= (ab[i] ?? 0) ^ (bb[i] ?? 0);
	}
	return diff === 0;
}

async function key(secret: string): Promise<CryptoKey> {
	return crypto.subtle.importKey(
		'raw',
		enc.encode(secret),
		{ name: 'HMAC', hash: 'SHA-256' },
		false,
		['sign']
	);
}

function b64url(bytes: ArrayBuffer): string {
	return btoa(String.fromCharCode(...new Uint8Array(bytes)))
		.replace(/\+/g, '-')
		.replace(/\//g, '_')
		.replace(/=+$/, '');
}

async function sign(secret: string, payload: string): Promise<string> {
	const sig = await crypto.subtle.sign('HMAC', await key(secret), enc.encode(payload));
	return b64url(sig);
}

/** Mint a session token. Signed with the PIN, so changing the PIN revokes
    every outstanding session — which is exactly what you want from a rotation. */
export async function mintSession(secret: string): Promise<string> {
	const expires = Math.floor(Date.now() / 1000) + TTL_SECONDS;
	return `${expires}.${await sign(secret, String(expires))}`;
}

export async function verifySession(secret: string, token: string | undefined): Promise<boolean> {
	if (!token) return false;
	const dot = token.indexOf('.');
	if (dot < 1) return false;

	const expires = Number(token.slice(0, dot));
	if (!Number.isFinite(expires) || expires < Math.floor(Date.now() / 1000)) return false;

	return timingSafeEqual(token.slice(dot + 1), await sign(secret, String(expires)));
}

export async function startSession(cookies: Cookies, secret: string): Promise<void> {
	cookies.set(COOKIE, await mintSession(secret), {
		path: '/',
		httpOnly: true,
		sameSite: 'strict',
		secure: true,
		maxAge: TTL_SECONDS
	});
}

export function endSession(cookies: Cookies): void {
	cookies.delete(COOKIE, { path: '/' });
}

export function sessionCookieName(): string {
	return COOKIE;
}

/**
 * Is this request an authenticated commissioner?
 * Returns false rather than throwing when COMMISH_PIN is unset, so a
 * misconfigured deployment locks the Desk instead of opening it.
 */
export async function isCommissioner(
	cookies: Cookies,
	secret: string | undefined
): Promise<boolean> {
	if (!secret) return false;
	return verifySession(secret, cookies.get(COOKIE));
}

/** Constant-time PIN check used by the login endpoint. */
export function pinMatches(candidate: unknown, secret: string | undefined): boolean {
	if (!secret || typeof candidate !== 'string') return false;
	return timingSafeEqual(candidate, secret);
}
