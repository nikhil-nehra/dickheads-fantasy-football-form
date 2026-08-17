import { spawn, execSync, type ChildProcess } from 'node:child_process';
import { rmSync } from 'node:fs';

/* ═══════════════════════════════════════════════════════════════════════════
   E2E harness
   ═══════════════════════════════════════════════════════════════════════════
   Builds the app, seeds a THROWAWAY local D1 (never the one `npm run dev`
   uses), and serves the real production bundle with wrangler. The tests then
   drive it over HTTP.

   The old repo's suites drove pages over file:// and stubbed the network,
   running the backend in a Node vm. That was a clever way to test an Apps
   Script backend, but it could never exercise the actual deployed artifact.
   This runs the same bundle that ships.
   ═══════════════════════════════════════════════════════════════════════════ */

export const PORT = 8788;
export const BASE = `http://127.0.0.1:${PORT}`;
export const PIN = '4242';

const STATE = '.wrangler-e2e';
const DB = 'dickheads-league';

let server: ChildProcess | undefined;

function run(cmd: string) {
	execSync(cmd, { stdio: 'pipe', env: { ...process.env, CI: 'true' } });
}

async function waitForReady(timeoutMs = 90_000) {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		try {
			const res = await fetch(`${BASE}/`);
			if (res.ok) return;
		} catch {
			// not up yet
		}
		await new Promise((r) => setTimeout(r, 500));
	}
	throw new Error(`Server did not become ready on ${BASE}`);
}

/**
 * Windows keeps a lock on workerd's SQLite files for a moment after the
 * process exits, so a plain rmSync can throw EBUSY and mask the actual test
 * results. The directory is gitignored and re-seeded on every run, so failing
 * to remove it is not worth failing the suite over.
 */
function removeState() {
	for (let attempt = 0; attempt < 5; attempt++) {
		try {
			rmSync(STATE, { recursive: true, force: true });
			return;
		} catch {
			execSync('node -e "setTimeout(()=>{},400)"', { stdio: 'ignore' });
		}
	}
}

export async function setup() {
	removeState();

	run('npm run build');
	run(`npx wrangler d1 migrations apply ${DB} --local --persist-to ${STATE}`);
	run(`npx wrangler d1 execute ${DB} --local --persist-to ${STATE} --file=db/seed.sql`);

	server = spawn(
		'npx',
		[
			'wrangler',
			'dev',
			'--port',
			String(PORT),
			'--persist-to',
			STATE,
			// Passed explicitly rather than read from .dev.vars, which is
			// gitignored and therefore absent in CI.
			'--var',
			`COMMISH_PIN:${PIN}`,
			'--var',
			'SEASON:2026',
			// The suite is a burst of writes from one IP, which the production
			// per-IP limit would (correctly) throttle. Raised here so the tests
			// exercise the real handlers; throttling itself is asserted against
			// the per-player bucket, which stays at its production value.
			'--var',
			'RATE_LIMIT_PER_MIN:5000'
		],
		{
			stdio: 'ignore',
			shell: process.platform === 'win32',
			// Own process group on POSIX so the whole tree can be signalled.
			detached: process.platform !== 'win32'
		}
	);

	await waitForReady();
}

/**
 * Kill the server AND its children.
 *
 * On Windows the process is started through a shell, so `child.kill()` only
 * kills the shell — wrangler and workerd survive, keep holding the build
 * directory, and make the NEXT run fail its build with EBUSY. `taskkill /T`
 * takes the whole tree.
 */
function stopServer() {
	if (!server?.pid) return;
	if (process.platform === 'win32') {
		try {
			execSync(`taskkill /F /T /PID ${server.pid}`, { stdio: 'ignore' });
		} catch {
			// already gone
		}
	} else {
		try {
			process.kill(-server.pid, 'SIGTERM');
		} catch {
			server.kill('SIGTERM');
		}
	}
	server = undefined;
}

export async function teardown() {
	stopServer();
	// Give workerd a moment to release its SQLite handles before removing them.
	await new Promise((r) => setTimeout(r, 2000));
	removeState();
}

/* ── Helpers shared by the specs ─────────────────────────────────────────── */

/** Every mutation must look same-origin, exactly as a browser would send it. */
export const ORIGIN_HEADERS = {
	'content-type': 'application/json',
	origin: BASE
};

export async function api(
	path: string,
	body: unknown,
	extra: Record<string, string> = {}
): Promise<{ status: number; body: Record<string, unknown> }> {
	const res = await fetch(`${BASE}${path}`, {
		method: 'POST',
		headers: { ...ORIGIN_HEADERS, ...extra },
		body: JSON.stringify(body)
	});
	const parsed = (await res.json().catch(() => ({}))) as Record<string, unknown>;
	return { status: res.status, body: parsed };
}

export async function login(): Promise<string> {
	const res = await fetch(`${BASE}/api/desk/session`, {
		method: 'POST',
		headers: ORIGIN_HEADERS,
		body: JSON.stringify({ pin: PIN })
	});
	const cookie = res.headers.get('set-cookie');
	if (!cookie) throw new Error('No session cookie returned');
	return cookie.split(';')[0];
}

export async function setStatus(cookie: string, surveyId: string, status: string) {
	return api('/api/desk/status', { surveyId, status }, { cookie });
}

export async function page(path: string): Promise<string> {
	const res = await fetch(`${BASE}${path}`);
	return res.text();
}

export const ROSTER = [
	'nikhil-nehra',
	'ryan-latin',
	'lyon-burns',
	'aidan-duncan',
	'stephen-comeaux',
	'jaswin-jabbal',
	'dhruv-nandwani',
	'sean-vargeese',
	'shishir-nambi',
	'matthew-yoshida',
	'samay-mohapatra',
	'prabhas-dande',
	'david-moton',
	'rayyan-ali'
];

/** A complete, valid intake submission for one player. */
export function intakeAnswers(playerId: string, over: Record<string, unknown> = {}) {
	return {
		buyIn: { choice: '50' },
		punishment: `${playerId} says: loser wears a Commanders jersey`,
		locality: { choice: 'local' },
		availability: { order: ['w2', 'w1', 'w3'], unavailable: ['w1fri'], mode: {} },
		beef: ROSTER.filter((p) => p !== playerId),
		prizeSplit: { buckets: [55, 30, 5], carveOut: 10 },
		...over
	};
}
