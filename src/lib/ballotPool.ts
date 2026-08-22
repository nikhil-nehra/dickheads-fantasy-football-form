/* ═══════════════════════════════════════════════════════════════════════════
   BALLOT POOL — which options a shortlist edit is allowed to take back off
   ═══════════════════════════════════════════════════════════════════════════
   The pool only ever grew. That is correct for the parts of it that come from
   other people — a write-in, an imported answer — and wrong for the one list
   the commissioner actually edits: rewriting `commissionerOptions` and
   re-opening the survey left BOTH wordings on the ballot, the superseded one
   sitting next to its replacement and splitting the vote with it. Which is the
   exact failure the punishments were hand-edited to avoid, reintroduced by the
   sync meant to apply the edit.

   Pure, and separated from the DELETE, because the interesting half is the
   decision: what is stale, and what is stale but has to stay anyway.
   ═══════════════════════════════════════════════════════════════════════════ */

export type PoolOption = {
	id: string;
	text: string;
	norm_text: string;
	source: 'commissioner' | 'imported' | 'writein';
};

export type PoolPlan = {
	/** Superseded, unranked, and safe to delete. */
	remove: PoolOption[];
	/** Superseded but already ranked by somebody, so it stays. */
	keep: PoolOption[];
};

/**
 * @param rows      every option currently in the pool for one question
 * @param keepNorm  the surviving shortlist, already normalised
 * @param ranked    option ids that at least one saved response points at
 */
export function planPrune(
	rows: readonly PoolOption[],
	keepNorm: readonly string[],
	ranked: ReadonlySet<string>
): PoolPlan {
	const keep = new Set(keepNorm);

	/* Only 'commissioner'. A write-in and an imported answer are somebody's
	   contribution to the pool rather than the commissioner's draft of it, and
	   an edit to the shortlist is not a reason to bin one — nor would it even
	   be findable there, since neither has ever been in `commissionerOptions`
	   and every one of them would read as stale. */
	const stale = rows.filter((r) => r.source === 'commissioner' && !keep.has(r.norm_text));

	return {
		/* A ranked option outlives the edit. Deleting one silently rewrites a
		   ballot that was cast honestly: the podium keeps the id, the id no
		   longer resolves, and the vote renders as a gap nobody can account for.
		   The commissioner can cut it from the shortlist; they cannot cut it out
		   from under a vote. */
		remove: stale.filter((r) => !ranked.has(r.id)),
		keep: stale.filter((r) => ranked.has(r.id))
	};
}
