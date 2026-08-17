import { describe, it, expect } from 'vitest';
import { fieldStatus, type Entry } from '../../src/lib/negotiation';

/**
 * The rivalry mechanic. Agreement is DERIVED from two independently-written
 * rows and never stored, which is what removes the contended write entirely.
 */

const e = (field: string, proposal: string | null, pick: string | null): Entry => ({
	field_key: field,
	proposal,
	pick
});

describe('deriving agreement', () => {
	it('is open when neither side has picked', () => {
		expect(fieldStatus('rname', [], []).state).toBe('open');
	});

	it('is open when both have proposed but neither has picked', () => {
		const st = fieldStatus('rname', [e('rname', 'Mine', null)], [e('rname', 'Theirs', null)]);
		expect(st.state).toBe('open');
		expect(st.myProposal).toBe('Mine');
		expect(st.theirProposal).toBe('Theirs');
	});

	it('is waiting when only one side has picked', () => {
		expect(fieldStatus('rname', [e('rname', 'Mine', 'Mine')], []).state).toBe('waiting');
		expect(fieldStatus('rname', [], [e('rname', 'Theirs', 'Theirs')]).state).toBe('waiting');
	});

	it('is waiting while the two picks differ', () => {
		const st = fieldStatus('rname', [e('rname', 'A', 'A')], [e('rname', 'B', 'B')]);
		expect(st.state).toBe('waiting');
		expect(st.value).toBeNull();
	});

	it('agrees the moment both picks match', () => {
		const st = fieldStatus('rname', [e('rname', 'A', 'The Clash')], [e('rname', 'B', 'The Clash')]);
		expect(st.state).toBe('agreed');
		expect(st.value).toBe('The Clash');
	});

	// "loser buys dinner" and "Loser Buys Dinner" count as agreement.
	it('ignores case and spacing when matching', () => {
		const st = fieldStatus(
			'bet',
			[e('bet', null, 'loser buys dinner')],
			[e('bet', null, '  Loser   Buys Dinner  ')]
		);
		expect(st.state).toBe('agreed');
		// The value shown is the caller's own wording, not a normalised form.
		expect(st.value).toBe('loser buys dinner');
	});

	it('treats whitespace-only picks as no pick at all', () => {
		expect(fieldStatus('rname', [e('rname', null, '   ')], [e('rname', null, '   ')]).state).toBe(
			'open'
		);
	});

	it('re-opens when one side changes their pick', () => {
		const agreed = fieldStatus('rname', [e('rname', null, 'X')], [e('rname', null, 'X')]);
		expect(agreed.state).toBe('agreed');
		// Either side can renege; nobody can lock the other out.
		const reneged = fieldStatus('rname', [e('rname', null, 'Y')], [e('rname', null, 'X')]);
		expect(reneged.state).toBe('waiting');
	});

	it('re-opens when one side withdraws their pick entirely', () => {
		const st = fieldStatus('rname', [e('rname', 'X', null)], [e('rname', null, 'X')]);
		expect(st.state).toBe('waiting');
	});

	it("a commissioner ruling overrides both sides' picks", () => {
		const st = fieldStatus(
			'side',
			[e('side', null, 'Mine')],
			[e('side', null, 'Mine')],
			[{ field_key: 'side', value: 'The commissioner has spoken' }]
		);
		expect(st.state).toBe('forced');
		expect(st.value).toBe('The commissioner has spoken');
		// The underlying picks are preserved, so withdrawing hands it straight back.
		expect(st.myPick).toBe('Mine');
	});

	it('withdrawing a ruling returns the line to whatever the players had', () => {
		const st = fieldStatus('side', [e('side', null, 'Mine')], [e('side', null, 'Mine')], []);
		expect(st.state).toBe('agreed');
		expect(st.value).toBe('Mine');
	});

	it('an empty ruling is not a ruling', () => {
		const st = fieldStatus('side', [], [], [{ field_key: 'side', value: '   ' }]);
		expect(st.state).toBe('open');
	});

	it('keeps fields independent of one another', () => {
		const mine = [e('rname', null, 'Same'), e('bet', null, 'Different')];
		const theirs = [e('rname', null, 'Same'), e('bet', null, 'Other')];
		expect(fieldStatus('rname', mine, theirs).state).toBe('agreed');
		expect(fieldStatus('bet', mine, theirs).state).toBe('waiting');
		expect(fieldStatus('side', mine, theirs).state).toBe('open');
	});
});
