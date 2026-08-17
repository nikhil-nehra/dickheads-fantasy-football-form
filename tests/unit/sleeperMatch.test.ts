import { describe, it, expect } from 'vitest';
import {
	scoreAccount,
	suggestFor,
	suggestAll,
	confidence,
	type SleeperAccount
} from '../../src/lib/sleeperMatch';

/**
 * The real handles from the league, so this suite documents what the matcher
 * actually manages against live data rather than against invented examples.
 */
const ACCOUNTS: SleeperAccount[] = [
	{ userId: 'u1', displayName: 'happihiro' },
	{ userId: 'u2', displayName: 'pdande97' },
	{ userId: 'u3', displayName: 'Wintermoon' },
	{ userId: 'u4', displayName: 'Raybot77', teamName: 'Profound Pounders' },
	{ userId: 'u5', displayName: 'nikhilnehra', teamName: 'Baul Swett' },
	{ userId: 'u6', displayName: 'samaymoh' },
	{ userId: 'u7', displayName: 'LyanRatin', teamName: 'LYAN RATIN' },
	{ userId: 'u8', displayName: 'veansarg', teamName: '808s (CRASHOUTS)' },
	{ userId: 'u9', displayName: 'scomeaux11' },
	{ userId: 'u10', displayName: 'F1ERY13' },
	{ userId: 'u11', displayName: 'myoshida' },
	{ userId: 'u12', displayName: 'dhruvn18' },
	{ userId: 'u13', displayName: 'jaswinjabbal' }
];

const account = (id: string) => ACCOUNTS.find((a) => a.userId === id)!;

describe('handle shapes', () => {
	it('matches first+last exactly', () => {
		expect(scoreAccount('Nikhil Nehra', account('u5')).score).toBeGreaterThanOrEqual(90);
	});

	it('matches first+last with no separator', () => {
		expect(scoreAccount('Jaswin Jabbal', account('u13')).score).toBeGreaterThanOrEqual(90);
	});

	it('ignores a trailing number', () => {
		// scomeaux11 -> s + comeaux
		expect(scoreAccount('Stephen Comeaux', account('u9')).score).toBeGreaterThanOrEqual(90);
		// pdande97 -> p + dande
		expect(scoreAccount('Prabhas Dande', account('u2')).score).toBeGreaterThanOrEqual(90);
		// dhruvn18 -> dhruv + n
		expect(scoreAccount('Dhruv Nandwani', account('u12')).score).toBeGreaterThanOrEqual(90);
	});

	it('matches initial + last name', () => {
		expect(scoreAccount('Matthew Yoshida', account('u11')).score).toBeGreaterThanOrEqual(90);
	});

	it('matches a truncated last name', () => {
		// samaymoh is a prefix of samaymohapatra
		expect(scoreAccount('Samay Mohapatra', account('u6')).score).toBeGreaterThan(60);
	});

	it('matches a transposed handle', () => {
		// LyanRatin swaps the initials of Ryan Latin
		expect(scoreAccount('Ryan Latin', account('u7')).score).toBeGreaterThan(50);
	});

	it('gives no signal for an unrelated handle', () => {
		expect(scoreAccount('Aidan Duncan', account('u3')).score).toBe(0);
		expect(scoreAccount('Shishir Nambi', account('u1')).score).toBe(0);
	});
});

describe('ranking suggestions', () => {
	it('puts the right account first', () => {
		const top = suggestFor('Nikhil Nehra', ACCOUNTS)[0];
		expect(top.userId).toBe('u5');
	});

	it('explains why it suggested something', () => {
		expect(suggestFor('Prabhas Dande', ACCOUNTS)[0].why).toMatch(/last name/);
	});

	it('skips accounts already claimed by someone else', () => {
		const suggestions = suggestFor('Nikhil Nehra', ACCOUNTS, new Set(['u5']));
		expect(suggestions.every((s) => s.userId !== 'u5')).toBe(true);
	});
});

describe('suggesting the whole mapping', () => {
	const ROSTER = [
		{ id: 'nikhil-nehra', display_name: 'Nikhil Nehra' },
		{ id: 'ryan-latin', display_name: 'Ryan Latin' },
		{ id: 'lyon-burns', display_name: 'Lyon Burns' },
		{ id: 'aidan-duncan', display_name: 'Aidan Duncan' },
		{ id: 'stephen-comeaux', display_name: 'Stephen Comeaux' },
		{ id: 'jaswin-jabbal', display_name: 'Jaswin Jabbal' },
		{ id: 'dhruv-nandwani', display_name: 'Dhruv Nandwani' },
		{ id: 'sean-vargeese', display_name: 'Sean Vargeese' },
		{ id: 'shishir-nambi', display_name: 'Shishir Nambi' },
		{ id: 'matthew-yoshida', display_name: 'Matthew Yoshida' },
		{ id: 'samay-mohapatra', display_name: 'Samay Mohapatra' },
		{ id: 'prabhas-dande', display_name: 'Prabhas Dande' },
		{ id: 'david-moton', display_name: 'David Moton' },
		{ id: 'rayyan-ali', display_name: 'Rayyan Ali' }
	];

	const mapping = suggestAll(ROSTER, ACCOUNTS);

	it('never assigns one Sleeper account to two players', () => {
		const used = Object.values(mapping).map((s) => s.userId);
		expect(new Set(used).size).toBe(used.length);
	});

	it('gets the unambiguous ones right', () => {
		expect(mapping['nikhil-nehra']?.userId).toBe('u5');
		expect(mapping['prabhas-dande']?.userId).toBe('u2');
		expect(mapping['stephen-comeaux']?.userId).toBe('u9');
		expect(mapping['matthew-yoshida']?.userId).toBe('u11');
		expect(mapping['dhruv-nandwani']?.userId).toBe('u12');
		expect(mapping['jaswin-jabbal']?.userId).toBe('u13');
		expect(mapping['samay-mohapatra']?.userId).toBe('u6');
	});

	it('leaves genuinely unguessable players unsuggested', () => {
		// happihiro / Wintermoon / F1ERY13 carry no name signal at all, so the
		// commissioner has to say who they are.
		expect(mapping['aidan-duncan']).toBeUndefined();
		expect(mapping['shishir-nambi']).toBeUndefined();
	});

	it('suggests most of the roster rather than almost none', () => {
		// Exact-name matching links 0 of 14 against these handles.
		expect(Object.keys(mapping).length).toBeGreaterThanOrEqual(7);
	});
});

describe('confidence bands', () => {
	it('labels the bands', () => {
		expect(confidence(100)).toBe('strong');
		expect(confidence(70)).toBe('likely');
		expect(confidence(30)).toBe('weak');
	});
});
