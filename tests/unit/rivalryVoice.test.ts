import { describe, it, expect } from 'vitest';
import { NONE, fieldStatus, isNone } from '../../src/lib/negotiation';

describe('isNone', () => {
	it('matches however somebody wrote it', () => {
		for (const v of [NONE, 'none', ' NONE ', 'None']) expect(isNone(v)).toBe(true);
	});

	it('does not match an actual answer', () => {
		expect(isNone('$20')).toBe(false);
		expect(isNone('None of your business')).toBe(false);
		expect(isNone(null)).toBe(false);
		expect(isNone('')).toBe(false);
	});
});

describe('agreeing there is no bet', () => {
	const entry = (pick: string | null) => [{ field_key: 'bet', proposal: null, pick }];

	it('is a settled outcome, not an unanswered question', () => {
		// The whole point: this has to be distinguishable from nobody answering.
		const agreedNone = fieldStatus('bet', entry(NONE), entry(NONE));
		expect(agreedNone.state).toBe('agreed');
		expect(isNone(agreedNone.value)).toBe(true);

		const nobodyAnswered = fieldStatus('bet', entry(null), entry(null));
		expect(nobodyAnswered.state).toBe('open');
		expect(isNone(nobodyAnswered.value)).toBe(false);
	});

	it('is still in dispute when only one of them says there is none', () => {
		const st = fieldStatus('bet', entry(NONE), entry('$20'));
		expect(st.state).toBe('waiting');
	});

	it('re-opens if one of them changes their mind', () => {
		const st = fieldStatus('bet', entry('$20'), entry(NONE));
		expect(st.state).toBe('waiting');
	});
});
