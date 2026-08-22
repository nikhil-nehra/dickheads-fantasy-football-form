import { describe, it, expect } from 'vitest';
import { planPrune, type PoolOption } from '../../src/lib/ballotPool';

/**
 * The pool used to be add-only, and the punishments were rewritten by hand
 * after it had already been materialised once. Without a prune, re-opening the
 * survey put both wordings on the ballot at the same time — each superseded
 * option quietly competing with the version that replaced it, which is the one
 * thing a ranked ballot must not do.
 *
 * Pruning is deletion, though, so what it REFUSES to delete matters more than
 * what it deletes.
 */

const opt = (
	id: string,
	norm_text: string,
	source: PoolOption['source'] = 'commissioner'
): PoolOption => ({ id, text: norm_text, norm_text, source });

const NOBODY = new Set<string>();

describe('planPrune', () => {
	it('removes a commissioner option that is no longer on the shortlist', () => {
		const rows = [opt('a', 'milk mile'), opt('b', 'crack stud')];
		const plan = planPrune(rows, ['milk mile'], NOBODY);
		expect(plan.remove.map((r) => r.id)).toEqual(['b']);
		expect(plan.keep).toEqual([]);
	});

	it('leaves an option somebody has already ranked, even once it is cut', () => {
		/* The vote outlives the edit. Deleting it would not un-cast the ballot
		   that points at it — it would leave that podium holding an id that no
		   longer resolves, so an honest vote renders as a hole. */
		const rows = [opt('a', 'milk mile'), opt('b', 'crack stud')];
		const plan = planPrune(rows, ['milk mile'], new Set(['b']));
		expect(plan.remove).toEqual([]);
		expect(plan.keep.map((r) => r.id)).toEqual(['b']);
	});

	it('never touches a write-in or an imported answer', () => {
		/* Neither has ever been in `commissionerOptions`, so a rule that went by
		   "not on the shortlist" alone would read every one of them as stale and
		   delete the entire rest of the pool on the first sync. */
		const rows = [
			opt('a', 'milk mile'),
			opt('w', 'shave the eyebrows', 'writein'),
			opt('i', 'something from the intake', 'imported')
		];
		const plan = planPrune(rows, ['milk mile'], NOBODY);
		expect(plan.remove).toEqual([]);
		expect(plan.keep).toEqual([]);
	});

	it('is a no-op when the shortlist has not changed', () => {
		const rows = [opt('a', 'milk mile'), opt('b', '24 hours in an ihop')];
		const plan = planPrune(rows, ['milk mile', '24 hours in an ihop'], NOBODY);
		expect(plan.remove).toEqual([]);
	});

	it('matches on normalised text, so a survivor is never deleted and re-added', () => {
		/* Re-creating an option that survived the edit would hand it a fresh id
		   and orphan every podium pointing at the old one — the exact bug the
		   stable-id design exists to prevent. The caller inserts first and
		   prunes second; this asserts the half that makes that safe. */
		const rows = [opt('a', 'milk mile')];
		expect(planPrune(rows, ['milk mile'], NOBODY).remove).toEqual([]);
	});

	it('empties the shortlist without emptying the pool', () => {
		const rows = [opt('a', 'milk mile'), opt('w', 'shave the eyebrows', 'writein')];
		const plan = planPrune(rows, [], NOBODY);
		expect(plan.remove.map((r) => r.id)).toEqual(['a']);
	});
});
