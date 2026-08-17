import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

/**
 * Exercises the ACTUAL shipped docs/_redirect.js rather than a copy of its
 * logic, by running it against a stubbed browser.
 *
 * These redirects are load-bearing: the whole premise of the site is that a
 * link pasted into Sleeper league chat keeps working forever, and the boards
 * were deep-linked by hash — which a <meta refresh> would silently drop.
 */
const SOURCE = readFileSync('docs/_redirect.js', 'utf8');

function redirectFor(pathname: string, hash = '', search = ''): string {
	let replaced = '';
	const link = { href: '', textContent: '' };

	runInNewContext(SOURCE, {
		location: {
			pathname,
			hash,
			search,
			replace: (url: string) => {
				replaced = url;
			}
		},
		document: { getElementById: () => link }
	});

	return replaced;
}

const BASE = 'https://dickheads-league.dickheads-league.workers.dev';
const OLD = '/dickheads-fantasy-football-form/';

describe('legacy link preservation', () => {
	// The old root served Survey 1 directly. It now lands on the hub, which
	// lists intake with its live status — one extra tap, but the link keeps
	// working after intake closes instead of dead-ending on a locked form.
	it('sends the old root to the hub', () => {
		expect(redirectFor(`${OLD}index.html`)).toBe(`${BASE}/`);
	});

	it('sends the old hub to the new hub', () => {
		expect(redirectFor(`${OLD}hub.html`)).toBe(`${BASE}/`);
	});

	it('sends the rivalry survey to its new route', () => {
		expect(redirectFor(`${OLD}rivalry.html`)).toBe(`${BASE}/s/rivalry`);
	});

	it('sends the desk to the new desk', () => {
		expect(redirectFor(`${OLD}desk.html`)).toBe(`${BASE}/desk`);
	});

	it('honours intake.html, the name the September swap would have used', () => {
		expect(redirectFor(`${OLD}intake.html`)).toBe(`${BASE}/s/intake`);
	});

	// The link actually pasted into Sleeper, per the old README.
	it('maps #rivalry — the board link shared in league chat', () => {
		expect(redirectFor(`${OLD}boards.html`, '#rivalry')).toBe(`${BASE}/b/rivalry`);
	});

	it('maps #draft', () => {
		expect(redirectFor(`${OLD}boards.html`, '#draft')).toBe(`${BASE}/b/draft`);
	});

	it('maps #pot', () => {
		expect(redirectFor(`${OLD}boards.html`, '#pot')).toBe(`${BASE}/b/pot`);
	});

	it('falls back to the rivalry board for boards.html with no hash', () => {
		expect(redirectFor(`${OLD}boards.html`)).toBe(`${BASE}/b/rivalry`);
	});

	it('ignores an unknown hash rather than 404ing', () => {
		expect(redirectFor(`${OLD}boards.html`, '#nonsense')).toBe(`${BASE}/b/rivalry`);
	});

	it('sends a bare directory URL to the hub', () => {
		expect(redirectFor(OLD)).toBe(`${BASE}/`);
	});

	it('preserves the query string', () => {
		expect(redirectFor(`${OLD}rivalry.html`, '', '?as=nikhil-nehra')).toBe(
			`${BASE}/s/rivalry?as=nikhil-nehra`
		);
	});

	it('fills in the manual fallback link too', () => {
		let link: { href: string; textContent: string } = { href: '', textContent: '' };
		runInNewContext(SOURCE, {
			location: { pathname: `${OLD}hub.html`, hash: '', search: '', replace: () => {} },
			document: { getElementById: () => link }
		});
		// Someone with JS half-broken still gets a clickable way through.
		expect(link.href).toBe(`${BASE}/`);
		expect(link.textContent).toBe(`${BASE}/`);
	});
});
