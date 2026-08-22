import { norm } from './text';

/* ═══════════════════════════════════════════════════════════════════════════
   THE PUNISHMENT
   ═══════════════════════════════════════════════════════════════════════════
   Four facts the league is held to, and the rules for reading them.

   The survey has an opinion about two of them. It does not GET to be them —
   that was the mistake The Pot board made first and this board inherited: a
   ballot that moves every time somebody votes is not a sentence anybody can
   be held to, and printing it as one invited exactly the January argument the
   vote was supposed to end.

   So the vote advises and the commissioner rules. This module holds the shape
   of that ruling and nothing else; the tally lives on the Desk, where reading
   it is the point.
   ═══════════════════════════════════════════════════════════════════════════ */

export type PunishmentRuling = {
	/** The sentence, in the commissioner's words. */
	punishment: string;
	/** Who serves it — usually a rule ("last place, toilet bowl"), not a name. */
	victim: string;
	/** When it has to be done by. */
	deadline: string;
	/** How it is done and what counts as proof. */
	instructions: string;
};

/**
 * The standing deadline. Written down here rather than left in the schema
 * default so the Desk can offer it as a starting point and the board can tell
 * "nobody has set one" apart from "somebody set it to the usual".
 */
export const DEFAULT_DEADLINE = 'The Super Bowl';

/**
 * Kickoff of Super Bowl LXI: Sunday 14 February 2027, 6:30pm Eastern.
 *
 * Written as UTC because that is the only way it means one moment for
 * everybody. February is EST, so Eastern is UTC-5 and 6:30pm becomes 23:30Z —
 * which is 5:30pm in Dallas, and that is what the board prints, because
 * `leagueTime` names the zone it is showing.
 *
 * "Before kickoff" is the rule the league actually agreed, so the clock counts
 * to the kick and not to the end of the game.
 */
export const SUPER_BOWL_KICKOFF = Date.parse('2027-02-14T23:30:00Z');

/**
 * Does this deadline name a moment we can actually count down to?
 *
 * Only the standing one does. A commissioner who types "Week 18" has said
 * something true that this codebase cannot turn into a timestamp, and running
 * a clock to the Super Bowl underneath it would be a confident lie. So the
 * board shows a clock exactly when it knows the moment, and the words alone
 * otherwise.
 *
 * Matched through `norm`, so trailing spaces and a lowercase "the super bowl"
 * still get their clock.
 */
export function isStandingDeadline(deadline: string): boolean {
	return norm(deadline) === norm(DEFAULT_DEADLINE);
}

export const EMPTY_RULING: PunishmentRuling = {
	punishment: '',
	victim: '',
	deadline: DEFAULT_DEADLINE,
	instructions: ''
};

/** Prose, so generous — but bounded, because it reaches a public page. */
export const MAX_PUNISHMENT = 400;
export const MAX_VICTIM = 200;
export const MAX_DEADLINE = 120;
export const MAX_INSTRUCTIONS = 2000;

/**
 * Trim and cap whatever the Desk sent.
 *
 * Deliberately not a validator that can fail: every field is free text a
 * commissioner typed, and there is no shape for it to be wrong in. The only
 * things worth enforcing are that it fits and that a deadline nobody typed
 * falls back to the one the league already agreed.
 */
export function parseRuling(raw: Partial<PunishmentRuling> | null | undefined): PunishmentRuling {
	const clip = (v: unknown, max: number) => String(v ?? '').trim().slice(0, max);
	const deadline = clip(raw?.deadline, MAX_DEADLINE);
	return {
		punishment: clip(raw?.punishment, MAX_PUNISHMENT),
		victim: clip(raw?.victim, MAX_VICTIM),
		deadline: deadline || DEFAULT_DEADLINE,
		instructions: clip(raw?.instructions, MAX_INSTRUCTIONS)
	};
}

/**
 * Is there a ruling to print at all?
 *
 * The punishment alone decides it. A deadline with no sentence attached is not
 * a half-finished board, it is an empty one — and the deadline is never blank,
 * because it defaults.
 */
export function isRuled(r: PunishmentRuling): boolean {
	return r.punishment.length > 0;
}
