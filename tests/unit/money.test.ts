import { describe, it, expect } from 'vitest';
import { formatMoney, isMoney, normaliseMoney, parseMoney } from '../../src/lib/money';

describe('parseMoney', () => {
	it('reads the ways people actually type an amount', () => {
		expect(parseMoney('20')).toBe(20);
		expect(parseMoney('$20')).toBe(20);
		expect(parseMoney(' $20 ')).toBe(20);
		expect(parseMoney('20.50')).toBe(20.5);
		expect(parseMoney('$1,000')).toBe(1000);
	});

	it('rejects prose that merely contains a number', () => {
		// "Loser pays $20 and does a lap" is a punishment, not a bet.
		expect(parseMoney('Loser pays $20 and does a lap')).toBeNull();
		expect(parseMoney('$20 and dignity')).toBeNull();
		expect(parseMoney('twenty')).toBeNull();
	});

	it('rejects nonsense and out-of-range amounts', () => {
		expect(parseMoney('')).toBeNull();
		expect(parseMoney(null)).toBeNull();
		expect(parseMoney('-20')).toBeNull();
		expect(parseMoney('20.505')).toBeNull();
		expect(parseMoney('2000000')).toBeNull();
	});
});

describe('formatMoney', () => {
	it('drops the pointless decimals on a whole amount', () => {
		expect(formatMoney(20)).toBe('$20');
		expect(formatMoney(1000)).toBe('$1,000');
	});

	it('keeps them when there are cents', () => {
		expect(formatMoney(20.5)).toBe('$20.50');
	});
});

describe('normaliseMoney', () => {
	it('collapses every spelling of the same amount to one string', () => {
		// This is the whole point: agreement is a string comparison, so "20" and
		// "$20" have to become the same answer or the two of them never agree.
		const spellings = ['20', '$20', ' 20 ', '$20.00', '20.00'];
		const canonical = spellings.map(normaliseMoney);
		expect(new Set(canonical).size).toBe(1);
		expect(canonical[0]).toBe('$20');
	});

	it('is idempotent, so re-saving does not drift', () => {
		expect(normaliseMoney(normaliseMoney('$1,000'))).toBe('$1,000');
	});

	it('returns null for anything that is not an amount', () => {
		expect(normaliseMoney('loser buys the wings')).toBeNull();
	});
});

describe('isMoney', () => {
	it('recognises what normaliseMoney writes', () => {
		for (const raw of ['20', '$20.50', '$1,000']) {
			expect(isMoney(normaliseMoney(raw))).toBe(true);
		}
	});

	it('says no to a bet saved before this line became numeric', () => {
		// The board falls back to prose for these rather than mangling them.
		expect(isMoney('Loser buys the wings at the draft')).toBe(false);
		expect(isMoney('')).toBe(false);
		expect(isMoney(null)).toBe(false);
	});
});
