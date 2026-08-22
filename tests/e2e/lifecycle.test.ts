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
	// The Pot used to be the board tested here, back when it was a readout of
	// the intake survey. It no longer reads a survey at all, so the assertion
	// moved to a board that still does.
	it('serves board data while the survey is closed', async () => {
		const html = await page('/b/rivalry');
		expect(html).toContain('The Rivalry Board');
		expect(html).toContain('Permanent record');
	});

	it('still serves board data once the survey is archived', async () => {
		await setStatus(cookie, 'intake', 'archived');
		await setStatus(cookie, 'rivalry', 'archived');
		const html = await page('/b/rivalry');
		expect(html).toContain('The Rivalry Board');
		expect(html).toContain('Permanent record');
	});

	it('gives each board its own link-preview metadata', async () => {
		const html = await page('/b/rivalry');
		expect(html).toMatch(/property="og:title"/);
		expect(html).toMatch(/property="og:image"/);
		expect(html).toMatch(/name="twitter:card"/);
	});
});

describe('[5b] the punishment board', () => {
	/* A ruling, not a tally. The board reads no survey at all — the same
	   correction The Pot had — so these assertions are about what a
	   commissioner set, never about what the ballot currently says. */
	it('says so plainly before anybody has ruled', async () => {
		const html = await page('/b/punishment');
		expect(html).toContain('The Punishment');
		expect(html).toContain('No punishment set yet');
	});

	it('carries the At Risk section whether or not anybody has ruled', async () => {
		/* It used to be nested inside the ruling, so the one part of this board
		   that is true all season was invisible for exactly the months when
		   "who is losing" is still an open question. It is a section of the
		   board in its own right now, and this is the assertion that keeps it
		   one — note that no ruling has been set at this point in the run. */
		const html = await page('/b/punishment');
		expect(html).toContain('No punishment set yet');
		expect(html).toContain('At Risk');
	});

	it('names nobody at risk, and says which silence it is', async () => {
		/* Nothing seeds `sleeper_cache` in this harness, so the honest answer
		   here is "Sleeper was never wired up" rather than "nobody has played" —
		   two silences that look identical on the page and mean opposite things.
		   Which one gets printed is decided by `riskState`, unit-tested across
		   all three cases in tests/unit/standings.test.ts.

		   The negative matters as much: no table, and no accusation. */
		const html = await page('/b/punishment');
		expect(html).toContain("Sleeper hasn't handed over any standings");
		expect(html).not.toMatch(/Bottom \d+ of \d+/);
	});

	it('publishes no vote counts, ever', async () => {
		const html = await page('/b/punishment');
		expect(html).not.toContain('The ballot');
		expect(html).not.toMatch(/\d+ pts/);
	});

	it('refuses a ruling from a stranger', async () => {
		const res = await api('/api/desk/punishment', { punishment: 'Nice try' });
		expect(res.status).toBe(403);
	});

	it('prints the ruling once the commissioner rules', async () => {
		const res = await api(
			'/api/desk/punishment',
			{
				punishment: '24 straight hours inside an IHOP',
				victim: 'Last place, toilet bowl',
				deadline: 'The Super Bowl',
				instructions: 'One photo an hour, timestamped, or the clock resets.'
			},
			{ cookie }
		);
		expect(res.status).toBe(200);

		const html = await page('/b/punishment');
		expect(html).toContain('24 straight hours inside an IHOP');
		expect(html).toContain('Last place, toilet bowl');
		expect(html).toContain('One photo an hour');
		expect(html).not.toContain('No punishment set yet');
	});

	it('states the standing deadline once, on the clock', async () => {
		/* Ruled with the standing deadline just above. The clock counts to that
		   exact kickoff and names it, so a "Done by: The Super Bowl" term six
		   inches higher was the same fact printed twice. The countdown is the
		   better of the two — it says how long is left, which the words cannot. */
		const html = await page('/b/punishment');
		expect(html).not.toContain('Done by');
		expect(html).toContain('Feb 14, 2027');
	});

	it('falls back to the term when a custom deadline leaves no clock', async () => {
		/* The other half, and the reason the term is conditional rather than
		   deleted: a deadline the league typed itself is not a timestamp, so
		   there is nothing to count down to and the words are the only statement
		   of it there is. Dropping the term outright would have lost the
		   deadline entirely on exactly the boards that need it spelled out. */
		const res = await api(
			'/api/desk/punishment',
			{ punishment: '24 straight hours inside an IHOP', deadline: 'Week 18, before kickoff' },
			{ cookie }
		);
		expect(res.status).toBe(200);

		const html = await page('/b/punishment');
		expect(html).toContain('Done by');
		expect(html).toContain('Week 18, before kickoff');
		// No clock, so no countdown chrome either.
		expect(html).not.toContain('Left to serve it');

		// Put the standing deadline back for the tests that follow.
		await api(
			'/api/desk/punishment',
			{
				punishment: '24 straight hours inside an IHOP',
				victim: 'Last place, toilet bowl',
				deadline: 'The Super Bowl',
				instructions: 'One photo an hour, timestamped, or the clock resets.'
			},
			{ cookie }
		);
	});

	it('falls back to the standing deadline when one is not given', async () => {
		// "By the Super Bowl" is the league's rule, not a field somebody has to
		// remember to fill in every season.
		const res = await api(
			'/api/desk/punishment',
			{ punishment: 'Trick or Treat in January', deadline: '   ' },
			{ cookie }
		);
		expect(res.status).toBe(200);
		expect((res.body as { ruling: { deadline: string } }).ruling.deadline).toBe('The Super Bowl');
	});

	it('outlives its survey like every other board', async () => {
		// Archived by [5] just above, and it still renders the ruling.
		expect(await page('/b/punishment')).toContain('Trick or Treat in January');
	});

	it('keeps the verdict off the Rivalry Board', async () => {
		const rivalry = await page('/b/rivalry');
		expect(rivalry).toContain('The Rivalry Board');
		expect(rivalry).not.toContain('RULING');
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
	let otherPairingId: string;

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
		otherPairingId = pairings.find((p) => p.a === 'ryan-latin' || p.b === 'ryan-latin')!.id;
	});

	it('lets the commissioner write their own side while signed in to the Desk', async () => {
		/* A commissioner's write takes the `bypassStatus` branch, which drops a
		   parameter out of the statement — and the binding list has to drop it
		   too, or D1 rejects the call outright and every line of the
		   commissioner's own rivalry 500s. Nothing else covers this: every other
		   test here is signed out, which is exactly how it survived.

		   On the other pairing, so it cannot disturb the assertions below. */
		const res = await api(
			'/api/surveys/rivalry/negotiation',
			{
				pairingId: otherPairingId,
				playerId: 'ryan-latin',
				fieldKey: 'rname',
				proposal: 'The Commissioner Was Here',
				pick: 'The Commissioner Was Here'
			},
			{ cookie }
		);
		expect(res.status).toBe(200);
		expect(await page('/b/rivalry')).toContain('The Commissioner Was Here');
	});

	it('still refuses a signed-out write once the survey is closed', async () => {
		// The bypass must not have widened the gate it bypasses.
		await setStatus(cookie, 'rivalry', 'closed');
		const shut = await api('/api/surveys/rivalry/negotiation', {
			pairingId: otherPairingId,
			playerId: 'rayyan-ali',
			fieldKey: 'rname',
			proposal: 'Not on my watch',
			pick: 'Not on my watch'
		});
		expect(shut.status).toBe(409);

		// ...while the commissioner still gets through, which is the point of it.
		const open = await api(
			'/api/surveys/rivalry/negotiation',
			{
				pairingId: otherPairingId,
				playerId: 'ryan-latin',
				fieldKey: 'rname',
				proposal: 'The Commissioner Was Here',
				pick: 'The Commissioner Was Here'
			},
			{ cookie }
		);
		expect(open.status).toBe(200);

		await setStatus(cookie, 'rivalry', 'open');
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

		// The NAME is the card's title, not a row in its body, so a name the two
		// of them have not settled shows as an unnamed title card.
		expect(await page('/b/rivalry')).toContain('Still unnamed');
	});

	it('shows a disputed body line as in dispute', async () => {
		const a = await api('/api/surveys/rivalry/negotiation', {
			pairingId,
			playerId: 'nikhil-nehra',
			fieldKey: 'side',
			proposal: 'Loser wears a Commanders jersey',
			pick: 'Loser wears a Commanders jersey'
		});
		const b = await api('/api/surveys/rivalry/negotiation', {
			pairingId,
			playerId: 'sean-vargeese',
			fieldKey: 'side',
			proposal: 'Something else entirely',
			pick: 'Something else entirely'
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

		// Agreement promotes it out of the body and onto the title card. The
		// second pairing in this block is still unnamed, so the negative
		// assertion here is about the NAME'S OWN BODY ROW being gone from every
		// card — not about the unnamed placeholder being absent from the page.
		const html = await page('/b/rivalry');
		expect(html).toContain('The Battle for the Last Brain Cell');
		expect(html).not.toContain('Rivalry name');
	});

	it('normalises a money line, so "20" and "$20" are the same answer', async () => {
		// Agreement is a string comparison. Without normalising, these two would
		// disagree forever about a number they had both already agreed on.
		const a = await api('/api/surveys/rivalry/negotiation', {
			pairingId,
			playerId: 'nikhil-nehra',
			fieldKey: 'bet',
			proposal: '20',
			pick: '20'
		});
		const b = await api('/api/surveys/rivalry/negotiation', {
			pairingId,
			playerId: 'sean-vargeese',
			fieldKey: 'bet',
			proposal: '$20.00',
			pick: '$20.00'
		});
		expect(a.status).toBe(200);
		expect(b.status).toBe(200);

		// A settled line shows the thing itself — the amount in its own tile —
		// rather than an "Agreed" badge. Everything on this board is agreed;
		// that is what the board is.
		const html = await page('/b/rivalry');
		expect(html).toContain('$20');
		expect(html).toContain('stake-amount');
	});

	it('refuses prose on a money line', async () => {
		const res = await api('/api/surveys/rivalry/negotiation', {
			pairingId,
			playerId: 'nikhil-nehra',
			fieldKey: 'bet',
			proposal: 'Loser buys the wings at the draft',
			pick: 'Loser buys the wings at the draft'
		});
		expect(res.status).toBe(422);
		expect(JSON.stringify(res.body)).toMatch(/dollar amount/);
	});

	it('stores a team colour normalised, and never as a body row', async () => {
		const res = await api('/api/surveys/rivalry/negotiation', {
			pairingId,
			playerId: 'nikhil-nehra',
			fieldKey: 'colorPrimary',
			pick: '  #B91932  '
		});
		expect(res.status).toBe(200);

		const html = await page('/b/rivalry');
		// Colours are the header's texture, so they reach the page as ink in a
		// pattern — never as a "Primary color" line in the card body.
		expect(html).not.toContain('Primary color');
		expect(html).toContain('rh__ink');
	});

	it('does not settle a colour line when both teams pick the same one', async () => {
		/* The one line where matching is the WRONG outcome. Both sides write the
		   same red; neither of them has agreed anything, because there was never
		   anything to agree — each still holds their own answer. */
		const res = await api('/api/surveys/rivalry/negotiation', {
			pairingId,
			playerId: 'sean-vargeese',
			fieldKey: 'colorPrimary',
			pick: '#b91932'
		});
		expect(res.status).toBe(200);

		const html = await page('/b/rivalry');
		expect(html).not.toContain('Primary color');
		// No badge, no "Agreed", no place in the settled count — an own line is
		// filtered out of the board's field list entirely.
		expect(html).not.toContain('#b91932</');
	});

	it('refuses anything that is not a colour on a colour line', async () => {
		const res = await api('/api/surveys/rivalry/negotiation', {
			pairingId,
			playerId: 'nikhil-nehra',
			fieldKey: 'colorPrimary',
			pick: 'a sort of maroon'
		});
		expect(res.status).toBe(422);
		expect(JSON.stringify(res.body)).toMatch(/has to be a colour/);
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
	it('materialises the commissioner shortlist when the survey opens', async () => {
		// Opening a survey is the moment its ballot pool is built. The shortlist
		// is the intake's punishment ideas, edited by hand into one option per
		// idea — see the note in src/lib/surveys/rivalry.ts.
		await setStatus(cookie, 'rivalry', 'open');
		const html = await page('/s/rivalry?as=nikhil-nehra');
		expect(html).toContain('Run the Milk Mile');
	});

	it('does NOT re-import the raw answers those options were edited from', async () => {
		/* `importFrom` is off for this question on purpose. Left on, every raw
		   intake string would land on the ballot beside its own cleaned-up
		   version and split the vote with it — and the ranked ballot's whole job
		   is to not do that. */
		const html = await page('/s/rivalry?as=nikhil-nehra');
		expect(html).not.toContain('Second thoughts, actually');
	});

	it('refuses a write-in, because this ballot no longer has one', async () => {
		/* The box came off the page, and this is the half that matters: the
		   endpoint keys off the question's own `writeIn`, so deleting it from
		   the definition closes the API in the same edit. A hidden box with a
		   live endpoint behind it would let anyone with curl put a fourteenth
		   option on a ballot people have already ranked. */
		const res = await api('/api/surveys/rivalry/ballot', {
			questionId: 'podium',
			text: 'Shave the eyebrows',
			playerId: 'ryan-latin'
		});
		expect(res.status).toBe(400);
		expect(res.body.error).toBe('unknown_question');

		// And nothing landed in the pool.
		const html = await page('/s/rivalry?as=nikhil-nehra');
		expect(html).not.toContain('Shave the eyebrows');
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
		/* The per-player response bucket is 20 a minute and is NOT raised for
		   the test run, so this asserts the production value. Uses a player
		   nothing else touches, so throttling them poisons no other test.

		   The bodies are deliberately junk: the limiter runs before validation,
		   which is the point — a burst costs the same whether or not it would
		   have saved anything. Everything under the limit comes back 422, and
		   the throttle is the moment that changes.

		   41, not 21, and the difference is the whole reason this comment
		   exists. `rateLimited` buckets on `floor(now / windowSeconds)` — a
		   FIXED window, not a sliding one — so a burst that straddles a minute
		   boundary is counted as two separate bursts. 24 requests split 8/16
		   trips nothing, which is exactly how this test failed once it was
		   written with 24. Above 2×the limit the split cannot save it: some
		   window has to receive 21. */
		const results: number[] = [];
		for (let i = 0; i < 41; i++) {
			const res = await api('/api/surveys/rivalry/response', {
				playerId: 'david-moton',
				answers: { podium: [`burst-${i}`] }
			});
			results.push(res.status);
		}

		expect(results.filter((s) => s === 422).length).toBeGreaterThan(0);
		expect(results).toContain(429);
	});
});

describe('[13] Draft Day is a countdown, not a survey readout', () => {
	const SECRET = 'loser gets waterboarded with ranch';

	beforeAll(async () => {
		await setStatus(cookie, 'intake', 'open');
		await api('/api/surveys/intake/response', {
			playerId: 'sean-vargeese',
			answers: intakeAnswers('sean-vargeese', { punishment: SECRET })
		});
	});

	it('publishes the burger order, fastest pick first', async () => {
		const html = await page('/b/draft');
		expect(html).toContain('Rayyan Ali');
		expect(html).toContain('0:36.00');
		expect(html).toContain('9:28.34');
	});

	it('names whoever still owes the league a burger', async () => {
		const html = await page('/b/draft');
		// Seeded, never given a time — must show up as unseeded, not vanish.
		expect(html).toContain('Dhruv Nandwani');
	});

	it('runs a second clock to the end of Aug 31', async () => {
		const html = await page('/b/draft');
		expect(html).toContain('Burger challenge closes');
		expect(html).toContain('Aug 31');
	});

	it('says so plainly when Sleeper has not been given a draft time', async () => {
		// The e2e database has never been touched by the sync worker, so there
		// is no cached draft — the board must degrade to a sentence, not a blank.
		const html = await page('/b/draft');
		expect(html).toMatch(/Sleeper hasn't been given a draft time yet/);
	});

	// The whole point of the rewrite: intake answers are Desk-only now.
	it('publishes none of the intake survey', async () => {
		const html = await page('/b/draft');
		expect(html).not.toContain(SECRET);
		// The availability grid the old Draft Day board was built out of.
		expect(html).not.toContain('Aug 28');
		expect(html).not.toContain('Rank the weekends');
	});

	it('keeps raw submissions off the pot board too', async () => {
		const html = await page('/b/pot');
		expect(html).not.toContain(SECRET);
		expect(html).not.toContain('Aug 28');
		// The buy-in vote, which this board used to publish as bars.
		expect(html).not.toContain('votes');
	});

	it('still shows the commissioner everything on the Desk', async () => {
		const res = await fetch(`${BASE}/desk`, { headers: { cookie } });
		const html = await res.text();
		expect(html).toContain(SECRET);
	});
});

describe('[14] The Pot is set from the Desk, not counted from a survey', () => {
	const SECRET = 'loser gets waterboarded with ranch';

	it('says so plainly before a buy-in has been set', async () => {
		const html = await page('/b/pot');
		expect(html).toMatch(/has not set the buy-in yet/);
	});

	it('refuses a split that does not total 100%', async () => {
		const res = await api('/api/desk/pot', {
			buyIn: 50,
			split: [
				{ bracket: 'final', place: 1, pct: 60 },
				{ bracket: 'final', place: 2, pct: 30 }
			]
		}, { cookie });
		expect(res.status).toBe(422);
		expect(JSON.stringify(res.body)).toMatch(/totals 90%/);
	});

	// A slice is a placement, not a sentence. The label the board prints is
	// derived from it, so there is nothing left to misspell.
	it('refuses a slice that does not name a real placement', () => api('/api/desk/pot', {
		buyIn: 50,
		split: [{ label: 'Toilet bowl champion', pct: 100 }]
	}, { cookie }).then((res) => {
		expect(res.status).toBe(422);
	}));

	it('refuses to pay the same placement twice', () => api('/api/desk/pot', {
		buyIn: 50,
		split: [
			{ bracket: 'final', place: 1, pct: 50 },
			{ bracket: 'final', place: 1, pct: 50 }
		]
	}, { cookie }).then((res) => {
		expect(res.status).toBe(422);
	}));

	it('refuses a stranger', async () => {
		const res = await api('/api/desk/pot', { buyIn: 50, split: [] });
		expect(res.status).toBe(403);
	});

	it('accepts a valid pot and publishes it', async () => {
		const res = await api('/api/desk/pot', {
			buyIn: 50,
			split: [
				{ bracket: 'final', place: 1, pct: 55 },
				{ bracket: 'final', place: 2, pct: 30 },
				{ bracket: 'final', place: 3, pct: 10 },
				{ bracket: 'regular', place: 1, pct: 5 }
			]
		}, { cookie });
		expect(res.status).toBe(200);

		const html = await page('/b/pot');
		// $50 x 14 players.
		expect(html).toContain('$700');
		expect(html).toContain('buy-in');
		// Labels the board derived from the placements, never stored.
		expect(html).toContain('1st place');
		expect(html).toContain('1st place, regular season');
		// 55% of $700, in real dollars rather than a percentage.
		expect(html).toContain('$385');
	});

	it('still publishes no survey answers once it has real numbers', async () => {
		const html = await page('/b/pot');
		expect(html).not.toContain(SECRET);
		expect(html).not.toContain('Aug 28');
		expect(html).not.toContain('Rank the weekends');
	});

	it('lists the whole roster as owing before anyone is marked', async () => {
		const html = await page('/b/pot');
		expect(html).toContain('Who has paid');
		expect(html).toContain('owes $50');
		expect(html).toContain('$0');
	});

	it('refuses a payment mark from a stranger', async () => {
		const res = await api('/api/desk/payment', { playerId: 'nikhil-nehra', paid: true });
		expect(res.status).toBe(403);
	});

	it('refuses a payment mark for somebody not on the roster', async () => {
		const res = await api(
			'/api/desk/payment',
			{ playerId: 'not-a-player', paid: true },
			{ cookie }
		);
		expect(res.status).toBe(404);
	});

	it('refuses a mark with no true/false', async () => {
		const res = await api('/api/desk/payment', { playerId: 'nikhil-nehra' }, { cookie });
		expect(res.status).toBe(400);
	});

	it('marks a player paid and moves the money', async () => {
		const res = await api(
			'/api/desk/payment',
			{ playerId: 'nikhil-nehra', paid: true },
			{ cookie }
		);
		expect(res.status).toBe(200);

		const html = await page('/b/pot');
		// One buy-in in, out of fourteen.
		expect(html).toContain('$50');
		expect(html).toContain('Nikhil Nehra');
	});

	it('un-marks a player again', async () => {
		const res = await api(
			'/api/desk/payment',
			{ playerId: 'nikhil-nehra', paid: false },
			{ cookie }
		);
		expect(res.status).toBe(200);
		expect(await page('/b/pot')).toContain('owes $50');
	});
});

describe('[15] the rivalry card leads with the name, not the humans', () => {
	// [9] left two pairings in place, one of them with a commissioner ruling on
	// the rivalry name — which is a settled value the board must print as the
	// card's title.
	it('uses the agreed rivalry name as the headline', async () => {
		const html = await page('/b/rivalry');
		expect(html).toContain('rh__name');
		// Owners are still on the card, just no longer the title.
		expect(html).toContain('pair-foot');
		expect(html).toContain('Nikhil Nehra');
	});

	it('weaves each half of the header from a team colour', async () => {
		const html = await page('/b/rivalry');

		// Two boxes with a gap, each carrying a tiling houndstooth as a data URI.
		expect(html).toContain('rh__half--a');
		expect(html).toContain('rh__half--b');
		expect(html).toContain('data:image/svg+xml');

		/* Nobody has picked colours yet, so both sides are the placeholder grey.
		   The generator reads two greys as a collision and answers with a coarser
		   tile on side b — which is the only thing separating the halves until
		   the survey lands, so it is worth pinning. */
		expect(html).toContain('--s-l:28px 28px');
		expect(html).toContain('--s-l:42px 42px');
	});

	it('renders both themes up front rather than waiting for JavaScript', async () => {
		// The Worker cannot know the reader's theme, so it ships both and lets a
		// media query choose. A board that only shipped one would flash.
		const html = await page('/b/rivalry');
		expect(html).toContain('--i-l:');
		expect(html).toContain('--i-d:');
	});

	it('names a rivalry that has not been named yet rather than leaving a gap', async () => {
		const html = await page('/b/rivalry');
		expect(html).toMatch(/Still unnamed|rh__name/);
	});
});

describe('[16] a bet and a forfeit are optional', () => {
	let pairingId: string;

	beforeAll(async () => {
		await setStatus(cookie, 'rivalry', 'open');
		const res = await api(
			'/api/desk/pairings',
			{ pairs: [['lyon-burns', 'dhruv-nandwani']], source: 'manual' },
			{ cookie }
		);
		expect(res.status).toBe(200);
		pairingId = (res.body.pairings as { id: string }[])[0].id;
	});

	const settle = (playerId: string, fieldKey: string, value: string) =>
		api('/api/surveys/rivalry/negotiation', {
			pairingId,
			playerId,
			fieldKey,
			proposal: value,
			pick: value
		});

	it('accepts "there is not one" on a money line without calling it invalid', async () => {
		// The money guard must not reject the one answer that means "no amount".
		const a = await settle('lyon-burns', 'bet', 'None');
		const b = await settle('dhruv-nandwani', 'bet', 'none');
		expect(a.status).toBe(200);
		expect(b.status).toBe(200);
	});

	it('draws nothing at all when they agreed to nothing at all', async () => {
		await settle('lyon-burns', 'side', 'None');
		await settle('dhruv-nandwani', 'side', 'None');

		const html = await page('/b/rivalry');
		// Not a sentence explaining the absence, and certainly not a "not set"
		// that would read as a card which failed to load. Just the name, the
		// teams and the two of them.
		expect(html).not.toContain('Pride only');
		// The survey's own copy for a settled-at-nothing line. It belongs there,
		// where the two of them are still deciding — never on the board.
		expect(html).not.toContain('No bet. Just pride.');
		expect(html).not.toContain('No forfeit. The bet is the whole bet.');
	});

	it('lets the one line they did agree stand on its own', async () => {
		await settle('lyon-burns', 'side', 'Loser changes their team name to LOSER');
		await settle('dhruv-nandwani', 'side', 'Loser changes their team name to LOSER');

		const html = await page('/b/rivalry');
		expect(html).toContain('Loser changes their team name to LOSER');
		// The bet they agreed not to have is not mentioned — a rivalry with only
		// a forfeit reads as a rivalry that is about the forfeit.
		expect(html).not.toMatch(/No bet\./);
	});
});
