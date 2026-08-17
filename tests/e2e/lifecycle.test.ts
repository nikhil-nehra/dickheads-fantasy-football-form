import { describe, it, expect, beforeAll } from 'vitest';
import {
	api,
	login,
	setStatus,
	page,
	intakeAnswers,
	BASE,
	PIN,
	ORIGIN_HEADERS
} from './setup';

/* ═══════════════════════════════════════════════════════════════════════════
   The lifecycle, end to end, against the real production bundle.

   These port the scenarios the old repo's Playwright suite covered, plus the
   ones it could not: concurrent status writes, cross-origin rejection, and
   pairing membership enforcement.
   ═══════════════════════════════════════════════════════════════════════════ */

let cookie: string;

beforeAll(async () => {
	cookie = await login();
});

describe('[1] commissioner session', () => {
	it('rejects a wrong PIN', async () => {
		const res = await api('/api/desk/session', { pin: '0000' });
		expect(res.status).toBe(401);
	});

	it('accepts the right PIN and issues an httpOnly session cookie', async () => {
		const res = await fetch(`${BASE}/api/desk/session`, {
			method: 'POST',
			headers: ORIGIN_HEADERS,
			body: JSON.stringify({ pin: PIN })
		});
		expect(res.status).toBe(200);
		const setCookie = res.headers.get('set-cookie') ?? '';
		expect(setCookie).toMatch(/HttpOnly/i);
		expect(setCookie).toMatch(/SameSite=Strict/i);
	});

	it('leaks nothing about the league before login', async () => {
		const html = await page('/desk');
		expect(html).toMatch(/Enter the .*digit code/);
		expect(html).not.toContain('League Control');
		expect(html).not.toContain('Nikhil Nehra');
	});
});

describe('[2] draft surveys are hidden', () => {
	it('404s a draft survey for the public', async () => {
		await setStatus(cookie, 'intake', 'draft');
		const res = await fetch(`${BASE}/s/intake`);
		expect(res.status).toBe(404);
	});

	it('keeps a draft survey off the hub', async () => {
		const html = await page('/');
		expect(html).not.toContain('Pre-Season Intake');
	});

	it('blocks writes to a draft survey', async () => {
		const res = await api('/api/surveys/intake/response', {
			playerId: 'nikhil-nehra',
			answers: intakeAnswers('nikhil-nehra')
		});
		expect(res.status).toBe(409);
		expect(res.body.error).toBe('survey_closed');
	});
});

describe('[3] an open survey accepts answers', () => {
	beforeAll(async () => {
		await setStatus(cookie, 'intake', 'open');
	});

	it('lists the survey on the hub', async () => {
		expect(await page('/')).toContain('Pre-Season Intake');
	});

	it('accepts a valid submission', async () => {
		const res = await api('/api/surveys/intake/response', {
			playerId: 'nikhil-nehra',
			answers: intakeAnswers('nikhil-nehra')
		});
		expect(res.status).toBe(200);
	});

	it('server-renders the saved answers back to that player', async () => {
		const html = await page('/s/intake?as=nikhil-nehra');
		expect(html).toContain('loser wears a Commanders jersey');
	});

	it('rejects an invalid prize split with a field-level message', async () => {
		const res = await api('/api/surveys/intake/response', {
			playerId: 'ryan-latin',
			answers: intakeAnswers('ryan-latin', {
				prizeSplit: { buckets: [50, 30], carveOut: 5 }
			})
		});
		expect(res.status).toBe(422);
		expect(JSON.stringify(res.body)).toMatch(/exactly 100%/);
	});

	it('rejects a name that is not on the roster', async () => {
		const res = await api('/api/surveys/intake/response', {
			playerId: 'not-a-player',
			answers: intakeAnswers('not-a-player')
		});
		expect(res.status).toBe(400);
	});

	it('rejects a cross-site write', async () => {
		const res = await fetch(`${BASE}/api/surveys/intake/response`, {
			method: 'POST',
			headers: { 'content-type': 'application/json', origin: 'https://evil.example' },
			body: JSON.stringify({ playerId: 'nikhil-nehra', answers: intakeAnswers('nikhil-nehra') })
		});
		expect(res.status).toBe(403);
	});
});

describe('[4] closing is enforced by the server', () => {
	it('rejects a write the moment the survey closes, leaving data intact', async () => {
		await setStatus(cookie, 'intake', 'closed');

		const res = await api('/api/surveys/intake/response', {
			playerId: 'nikhil-nehra',
			answers: intakeAnswers('nikhil-nehra', { punishment: 'SNUCK IN AFTER CLOSING' })
		});
		expect(res.status).toBe(409);

		const html = await page('/s/intake?as=nikhil-nehra');
		expect(html).not.toContain('SNUCK IN AFTER CLOSING');
		expect(html).toContain('loser wears a Commanders jersey');
	});

	it('renders the page read-only rather than hiding it', async () => {
		const html = await page('/s/intake?as=nikhil-nehra');
		expect(html).toContain('Read-only');
		expect(html).not.toContain('btn btn--primary');
	});
});

describe('[5] boards outlive their survey', () => {
	it('serves board data while the survey is closed', async () => {
		const html = await page('/b/pot');
		expect(html).toContain('winning buy-in');
		expect(html).toContain('$50');
	});

	it('still serves board data once the survey is archived', async () => {
		await setStatus(cookie, 'intake', 'archived');
		const html = await page('/b/pot');
		expect(html).toContain('winning buy-in');
		expect(html).toContain('$50');
	});

	it('gives each board its own link-preview metadata', async () => {
		const html = await page('/b/rivalry');
		expect(html).toMatch(/property="og:title"/);
		expect(html).toMatch(/property="og:image"/);
		expect(html).toMatch(/name="twitter:card"/);
	});
});

describe('[6] reopening restores everything', () => {
	it('accepts writes again and keeps every earlier answer', async () => {
		await setStatus(cookie, 'intake', 'open');

		const html = await page('/s/intake?as=nikhil-nehra');
		expect(html).toContain('loser wears a Commanders jersey');

		const res = await api('/api/surveys/intake/response', {
			playerId: 'nikhil-nehra',
			answers: intakeAnswers('nikhil-nehra', { punishment: 'Second thoughts, actually' })
		});
		expect(res.status).toBe(200);
		expect(await page('/s/intake?as=nikhil-nehra')).toContain('Second thoughts, actually');
	});
});

describe('[7] concurrent status writes do not clobber each other', () => {
	it('applies two simultaneous writes to different surveys', async () => {
		await setStatus(cookie, 'intake', 'open');
		await setStatus(cookie, 'rivalry', 'open');

		// This is the exact case the old blob-based status map got wrong: the
		// Desk read the whole map once and wrote it back wholesale, so one tab
		// silently reverted the other survey.
		await Promise.all([
			setStatus(cookie, 'intake', 'closed'),
			setStatus(cookie, 'rivalry', 'archived')
		]);

		const hub = await page('/desk');
		expect(hub).toBeTruthy();

		// Assert through observable behaviour: intake is closed (writes
		// rejected) and rivalry is archived (off the hub).
		const write = await api('/api/surveys/intake/response', {
			playerId: 'lyon-burns',
			answers: intakeAnswers('lyon-burns')
		});
		expect(write.status).toBe(409);
		expect(await page('/')).not.toContain('Rivalry Week & The Punishment');
	});
});

describe('[8] authorization', () => {
	it('refuses a status change without a session', async () => {
		const res = await api('/api/desk/status', { surveyId: 'intake', status: 'open' });
		expect(res.status).toBe(403);
	});

	it('refuses an unknown status even with a session', async () => {
		const res = await api('/api/desk/status', { surveyId: 'intake', status: 'nonsense' }, { cookie });
		expect(res.status).toBe(400);
	});

	it('refuses a ruling without a session', async () => {
		const res = await api('/api/desk/ruling', {
			pairingId: 'whatever',
			fieldKey: 'rname',
			value: 'x'
		});
		expect(res.status).toBe(403);
	});
});

describe('[9] rivalry negotiation', () => {
	let pairingId: string;

	beforeAll(async () => {
		await setStatus(cookie, 'rivalry', 'open');
		const res = await api(
			'/api/desk/pairings',
			{
				pairs: [
					['nikhil-nehra', 'sean-vargeese'],
					['ryan-latin', 'rayyan-ali']
				],
				source: 'manual'
			},
			{ cookie }
		);
		expect(res.status).toBe(200);

		// Taken from the response rather than scraped out of the page: ballot
		// option ids are UUIDs too, so a regex over the HTML picks the wrong one.
		const pairings = res.body.pairings as { id: string; a: string; b: string }[];
		pairingId = pairings.find((p) => p.a === 'nikhil-nehra' || p.b === 'nikhil-nehra')!.id;
	});

	it('refuses a ruling on a pairing that does not exist', async () => {
		const res = await api(
			'/api/desk/ruling',
			{ pairingId: 'no-such-pairing', fieldKey: 'rname', value: 'x' },
			{ cookie }
		);
		expect(res.status).toBe(404);
	});

	it('rejects a pairing that puts someone in two rivalries', async () => {
		const res = await api(
			'/api/desk/pairings',
			{ pairs: [['nikhil-nehra', 'sean-vargeese'], ['nikhil-nehra', 'lyon-burns']] },
			{ cookie }
		);
		expect(res.status).toBe(409);
	});

	it('shows a line as in dispute while the picks differ', async () => {
		const a = await api('/api/surveys/rivalry/negotiation', {
			pairingId,
			playerId: 'nikhil-nehra',
			fieldKey: 'rname',
			proposal: 'The Battle for the Last Brain Cell',
			pick: 'The Battle for the Last Brain Cell'
		});
		const b = await api('/api/surveys/rivalry/negotiation', {
			pairingId,
			playerId: 'sean-vargeese',
			fieldKey: 'rname',
			proposal: 'Something else',
			pick: 'Something else'
		});
		expect(a.status).toBe(200);
		expect(b.status).toBe(200);

		expect(await page('/b/rivalry')).toContain('In dispute');
	});

	it('agrees when both land on the same answer, ignoring case and spacing', async () => {
		const res = await api('/api/surveys/rivalry/negotiation', {
			pairingId,
			playerId: 'sean-vargeese',
			fieldKey: 'rname',
			proposal: 'Something else',
			pick: '  the BATTLE for the last brain cell  '
		});
		expect(res.status).toBe(200);

		const html = await page('/b/rivalry');
		expect(html).toContain('Agreed');
		expect(html).toContain('The Battle for the Last Brain Cell');
	});

	it('refuses a write from someone outside the pairing', async () => {
		const res = await api('/api/surveys/rivalry/negotiation', {
			pairingId,
			playerId: 'lyon-burns',
			fieldKey: 'rname',
			proposal: 'hijack',
			pick: 'hijack'
		});
		expect(res.status).toBe(403);
		expect(res.body.error).toBe('not_in_pairing');
	});

	it('lets the commissioner force a ruling and withdraw it', async () => {
		const forced = await api(
			'/api/desk/ruling',
			{ pairingId, fieldKey: 'bet', value: 'Loser buys the first round' },
			{ cookie }
		);
		expect(forced.status).toBe(200);
		expect(await page('/b/rivalry')).toContain('Loser buys the first round');

		const withdrawn = await api(
			'/api/desk/ruling',
			{ pairingId, fieldKey: 'bet', value: '' },
			{ cookie }
		);
		expect(withdrawn.status).toBe(200);
		expect(await page('/b/rivalry')).not.toContain('Loser buys the first round');
	});
});

describe('[10] linking players to Sleeper accounts', () => {
	it('refuses to link without a session', async () => {
		const res = await api('/api/desk/link', {
			playerId: 'nikhil-nehra',
			sleeperUserId: '123'
		});
		expect(res.status).toBe(403);
	});

	it('refuses an unknown player', async () => {
		const res = await api(
			'/api/desk/link',
			{ playerId: 'nobody', sleeperUserId: '123' },
			{ cookie }
		);
		expect(res.status).toBe(404);
	});

	it('links a player and then unlinks them', async () => {
		const linked = await api(
			'/api/desk/link',
			{ playerId: 'nikhil-nehra', sleeperUserId: 'sleeper-1', rosterId: 3 },
			{ cookie }
		);
		expect(linked.status).toBe(200);
		expect(linked.body.outcome).toBe('linked');

		const cleared = await api(
			'/api/desk/link',
			{ playerId: 'nikhil-nehra', sleeperUserId: null },
			{ cookie }
		);
		expect(cleared.status).toBe(200);
		expect(cleared.body.outcome).toBe('unlinked');
	});

	it('refuses to attach one Sleeper account to two players', async () => {
		await api(
			'/api/desk/link',
			{ playerId: 'nikhil-nehra', sleeperUserId: 'sleeper-shared' },
			{ cookie }
		);
		// A wrong link credits one player's results to another, so the UNIQUE
		// constraint has to surface rather than silently win.
		const clash = await api(
			'/api/desk/link',
			{ playerId: 'ryan-latin', sleeperUserId: 'sleeper-shared' },
			{ cookie }
		);
		expect(clash.status).toBe(409);
		expect(clash.body.error).toBe('already_linked');
	});
});

describe('[11] the ballot pool', () => {
	it('carries free-text answers across from another survey', async () => {
		// Opening rivalry syncs the pool from intake's punishment answers.
		await setStatus(cookie, 'rivalry', 'open');
		const html = await page('/s/rivalry?as=nikhil-nehra');
		expect(html).toContain('Second thoughts, actually');
	});

	it('de-duplicates a write-in that already exists', async () => {
		const first = await api('/api/surveys/rivalry/ballot', {
			questionId: 'podium',
			text: 'Shave the eyebrows',
			playerId: 'ryan-latin'
		});
		const again = await api('/api/surveys/rivalry/ballot', {
			questionId: 'podium',
			text: '  shave   THE eyebrows ',
			playerId: 'lyon-burns'
		});
		expect(first.status).toBe(200);
		expect(again.status).toBe(200);
		// The same option, not a second one.
		expect(again.body.id).toBe(first.body.id);
	});

	it('rejects a ballot option id that does not exist', async () => {
		const res = await api('/api/surveys/rivalry/response', {
			playerId: 'nikhil-nehra',
			answers: { podium: ['made-up-id'], target: { choice: 'reg-last' } }
		});
		expect(res.status).toBe(422);
	});
});

describe('[12] rate limiting', () => {
	it('throttles a burst from one player', async () => {
		// The per-player ballot bucket is 10 a minute and is NOT raised for the
		// test run, so this asserts the production value. Uses a player nothing
		// else touches, so throttling them poisons no other test.
		const results: number[] = [];
		for (let i = 0; i < 14; i++) {
			const res = await api('/api/surveys/rivalry/ballot', {
				questionId: 'podium',
				text: `burst option ${i}`,
				playerId: 'david-moton'
			});
			results.push(res.status);
		}

		expect(results.filter((s) => s === 200).length).toBeGreaterThan(0);
		expect(results).toContain(429);
	});
});
