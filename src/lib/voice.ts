/* ═══════════════════════════════════════════════════════════════════════════
   VOICE
   ═══════════════════════════════════════════════════════════════════════════
   Every joke on the site is in this file. Nothing funny should be typed into a
   component — put the line here, reference it there, and adding a new one is a
   one-line diff that needs no markup.

   The register is the original's, turned up: crude, fond, and aimed only at
   the fourteen people who already know each other. It insults the reader, not
   any group the reader belongs to. Keep it that way.

   Two hard rules:

   1. A heckle never replaces the information. `heckle()` prefixes the real
      validation message, it does not swap it out — a form that is funny and
      unusable is just unusable.

   2. Selection must be deterministic. These strings are server-rendered, so a
      `Math.random()` here would produce one line on the server and a different
      one after hydration, and Svelte would log a mismatch. `pick()` hashes a
      stable key instead.
   ═══════════════════════════════════════════════════════════════════════════ */

/** FNV-1a. Small, stable, and identical on the Worker and in the browser. */
function hash(input: string): number {
	let h = 2166136261;
	for (let i = 0; i < input.length; i++) {
		h ^= input.charCodeAt(i);
		h = Math.imul(h, 16777619);
	}
	return h >>> 0;
}

/** Deterministically choose from a pool. The same key always gives the same line. */
export function pick<T>(pool: readonly T[], key: string | number): T {
	return pool[hash(String(key)) % pool.length];
}

/* ── Banner one-liners ─────────────────────────────────────────────────── */

export type Scope = 'hub' | 'survey' | 'board' | 'desk';

/**
 * The subtitle under the title cycles through these. First entry is what the
 * server renders, so put the strongest line first in each pool.
 */
export const BANNER: Record<Scope, readonly string[]> = {
	hub: [
		'Fill it out. No exceptions. League business is not optional.',
		'Fourteen dickheads, one commissioner, zero democracy.',
		"If it's open, it needs you. If it's closed, you were late.",
		'The commissioner sees all. The commissioner also screenshots all.',
		'Everything here is permanent. Choose your words like it.',
		'Participation is mandatory. Enthusiasm is encouraged but not required.'
	],
	survey: [
		'Answer honestly. It gets read aloud at the draft either way.',
		'Every field is a chance to embarrass yourself. Take it.',
		"You have until the commissioner gets bored, which is not long.",
		'Nothing you type here is private. Nothing you type here is deleted.',
		'Half of you will fill this in at 2am. Be the other half.'
	],
	board: [
		'Surveys close. Boards are forever. So is this screenshot.',
		'Public, permanent, and impossible to delete. Ask nicely anyway.',
		"Results don't lie. You do. Results don't.",
		'Paste this in the group chat and let it do the talking.'
	],
	desk: [
		'Absolute power, four digits.',
		'Everything on this page is your fault.',
		'You wanted the job. Nobody else did.',
		'Rule fairly. Or don’t — nobody can stop you.'
	]
};

/* ── Empty and loading states ──────────────────────────────────────────── */

export const EMPTY = {
	noSurveys: "Nothing open right now. Enjoy the quiet — it won't last.",
	noArchive: 'Nothing archived yet. Give it a season.',
	noPairings: "No rivalries posted yet. Nobody's mad at anybody. Deeply suspicious.",
	noStandings:
		"Sleeper hasn't handed over any data yet. Either the season hasn't started or the commissioner hasn't wired it up.",
	noResponses: 'Not one response. Fourteen grown adults, zero of them capable of clicking a link.',
	noPunishments: 'Nobody has suggested a punishment. Somehow that is worse than a bad one.',
	noPunishment:
		'No punishment set yet. The vote is in the commissioner’s hands, and the commissioner is taking their time.',
	notPicked: 'Pick your name to get started. Yes, your actual one.',
	noDraftDate:
		"Sleeper hasn't been given a draft time yet. Set one in the Sleeper app and it turns up here on its own.",
	noRuns: 'Nobody has eaten a burger. Fourteen empty plates and one very disappointed commissioner.',
	noBuyIn:
		'The commissioner has not set the buy-in yet. Until he does, this is a league playing for pride.',
	noSplit: 'No payout split set. Winner takes everything, apparently, including the argument.'
} as const;

export const LOADING: readonly string[] = [
	'Checking what’s open…',
	'Waking the commissioner…',
	'Counting dickheads…',
	'Consulting the rulebook nobody read…'
];

/* ── Heckles ───────────────────────────────────────────────────────────── */

/**
 * Openers for a validation failure. Deliberately short — the real message
 * follows immediately, so these must not bury it.
 */
const OPENERS: readonly string[] = [
	'No.',
	'Absolutely not.',
	'Be serious.',
	'Try again.',
	'Come on.',
	'Nope.'
];

/**
 * Dress a validation message without replacing it. `key` should be something
 * stable about the failure — the question id — so the opener does not change
 * on every keystroke while the reader is fixing it.
 */
export function heckle(message: string, key: string | number = 'x'): string {
	return `${pick(OPENERS, key)} ${message}`;
}

/** Failures where a bespoke line beats a generic opener. */
export const ERRORS = {
	closedMidSession:
		'The commissioner closed this survey while you were sitting on it. You had weeks.',
	network: "Couldn't reach the server. Check your connection, then check your attitude.",
	generic: 'Something went wrong saving that. Try again — it usually works the second time.',
	someWrong: 'Some of these need another look. They are highlighted, so there is no excuse.',
	allDatesOut:
		'You marked every single date as unavailable. That is not availability, that is a hostage note.',
	overwrite:
		'You already have an answer saved. Locking in now overwrites it — hit it again if you meant that.',
	badPin: 'Wrong. The commissioner would have known that.'
} as const;

/* ── The name nag ──────────────────────────────────────────────────────── */

/** Straight from the original, which got this exactly right the first time. */
export const NAG = {
	first:
		"I know you think you're SO FUNNY putting someone else's name, but please — I need your actual name for this (love you ❤️)",
	second: 'If this is your actual name, I love you 3000!'
} as const;

/* ── Roasts ────────────────────────────────────────────────────────────── */

/**
 * Name and shame whoever has not answered. Returns null when everyone is in,
 * so the caller renders nothing rather than an awkward empty roast.
 */
export function roast(missing: readonly string[], total: number): string | null {
	if (missing.length === 0) return null;

	if (missing.length === total) {
		return `Nobody has answered. All ${total} of you. Genuinely impressive.`;
	}

	if (missing.length === 1) {
		return `Everyone is in except ${missing[0]}. It is one link, ${missing[0]}.`;
	}

	if (missing.length <= 4) {
		const list = `${missing.slice(0, -1).join(', ')} and ${missing[missing.length - 1]}`;
		return `Still waiting on ${list}. You know who you are, because we just told you.`;
	}

	return `${missing.length} of you haven't filled this in. Cowards, the lot of you.`;
}

/** A line for whoever is losing, keyed on their name so it stays put. */
const LAST_PLACE: readonly string[] = [
	'currently the reason the punishment exists',
	'playing for pride, and losing that too',
	'has a mathematical chance and nothing else',
	'is the punishment frontrunner and knows it'
];

export function lastPlaceNote(name: string): string {
	return `${name} — ${pick(LAST_PLACE, name)}.`;
}

/* ── The burger challenge ─────────────────────────────────────────── */

/** The draft order is bought with a burger. These are the two states it can be in. */
export const DRAFT = {
	/** Under the big clock, before the draft. */
	waiting: 'Order below is provisional until the last burger is down.',
	/** Under the big clock, once the draft time has passed. */
	live: "You're on the clock. Whatever you did to that burger, you live with it now.",
	/** Under the order, once everybody has eaten. */
	locked: 'All fourteen plates clean. This order is final and nobody gets to argue.',
	/** Under the order, once the deadline has gone and somebody still hasn't. */
	forfeit:
		'Deadline gone. Anyone still unlisted drafts behind everyone who could be bothered to chew.'
} as const;

/**
 * Name and shame whoever still owes the league a burger. Returns null when
 * everyone has eaten, so the caller renders the locked line instead.
 */
export function burgerRoast(pending: readonly string[], total: number): string | null {
	if (pending.length === 0) return null;

	if (pending.length === total) {
		return `Not one of you has eaten. All ${total}, holding up the entire draft over a sandwich.`;
	}

	if (pending.length === 1) {
		return `Everyone has eaten except ${pending[0]}. It is one burger, ${pending[0]}. Pick number ${total} is yours if you keep this up.`;
	}

	if (pending.length <= 4) {
		const list = `${pending.slice(0, -1).join(', ')} and ${pending[pending.length - 1]}`;
		return `Still waiting on ${list} to sit down and eat. The clock is not sympathetic.`;
	}

	return `${pending.length} of you have not eaten. That is half the league drafting on vibes.`;
}

/* ── The money ─────────────────────────────────────────────────────────────── */

/**
 * Name and shame whoever still owes the buy-in. Null when everyone has paid,
 * so the caller prints the settled line instead.
 */
export function duesRoast(owing: readonly string[], total: number): string | null {
	if (owing.length === 0) return null;

	if (owing.length === total) {
		return `Not one of you has paid. The pot is currently a rumour.`;
	}

	if (owing.length === 1) {
		return `Everyone has paid except ${owing[0]}. The whole pot is waiting on ${owing[0]}.`;
	}

	if (owing.length <= 4) {
		const list = `${owing.slice(0, -1).join(', ')} and ${owing[owing.length - 1]}`;
		return `Still owed by ${list}. Pay the man, gentlemen.`;
	}

	return `${owing.length} of you have not paid. A pot this theoretical cannot be won.`;
}

/** For the moment everyone is square. */
export const PAID_UP = 'Everyone has paid. Genuinely, well done — this has never happened before.';

/** Before the commissioner has marked anyone. */
export const NOBODY_MARKED =
	'Nobody is marked paid yet. Either the season has not started or the commissioner has not been to the Desk.';

/* ── The rivalry cards ──────────────────────────────────────── */

export const RIVALRY = {
	/** Where the agreed name goes, before there is one. */
	unnamed: 'Still unnamed',

	/**
	 * The last word under the negotiation block.
	 *
	 * The mechanic is deliberately one that CANNOT be finished alone — a line
	 * settles only when both sides land on the same answer — so the form has to
	 * say what happens when nobody blinks, and point at the thing that actually
	 * unblocks it. Which is a text message, not another visit to this page.
	 */
	deadline: 'Not settled by draft day and the commissioner picks. Text each other.',

	/** Both teams picked a colour that will not survive the header's 8% wash. */
	clash: (short: string, rival: string) =>
		`Too close to ${rival}'s ${short.toLowerCase()}. Your half of the board will look like theirs.`,


	/**
	 * What the flames mean, for a tooltip and for a screen reader — the icons
	 * are decoration, this is the sentence that carries the information.
	 */
	heat(n: number): string {
		if (n >= 3) return 'Fully settled — name, bet and side forfeit all agreed. This one is on.';
		if (n === 2) return 'Two of three lines agreed. Nearly on.';
		return 'One line agreed. Barely warm.';
	}
} as const;
