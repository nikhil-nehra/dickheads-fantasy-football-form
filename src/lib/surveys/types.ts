/* ═══════════════════════════════════════════════════════════════════════════
   SURVEY DEFINITIONS — the type system
   ═══════════════════════════════════════════════════════════════════════════

   A survey is DATA. Adding one is a single file in this folder plus a row in
   the `survey` table — no new page, no new route, no backend change.

   The old site promised this ("add a survey there and a card appears here
   automatically") but did not deliver it: three hardcoded dispatch sites
   meant a third survey rendered 0/14 forever on the hub and showed the wrong
   tab on the Desk. Nothing here is allowed to switch on a survey id.
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Show a question only once another question is answered, or answered with a
 * particular value. The old form had exactly one conditional (out-of-towners
 * see the in-person/virtual chips) and hardcoded it into the markup.
 */
export type ShowIf =
	| { question: string; equals: string }
	| { question: string; answered: true };

type Base = {
	id: string;
	prompt: string;
	/** Secondary line under the prompt. Supports no markup — it is escaped. */
	help?: string;
	required?: boolean;
	showIf?: ShowIf;
};

export type Choice = { id: string; label: string; sub?: string };

/** One choice from a fixed list. Buy-in, locality, who-takes-the-punishment. */
export type SingleQuestion = Base & {
	type: 'single';
	options: Choice[];
	/** Renders an extra "Something else" row with a free-text input. */
	writeIn?: { label: string; placeholder?: string; maxLength?: number };
	layout?: 'chips' | 'list';
};

/** Any number of choices from a fixed list. */
export type MultiQuestion = Base & {
	type: 'multi';
	options: Choice[];
	min?: number;
	max?: number;
	layout?: 'chips' | 'list';
};

/** Free text. `lines` decides input vs textarea. */
export type TextQuestion = Base & {
	type: 'text';
	lines?: number;
	placeholder?: string;
	maxLength?: number;
};

/**
 * Drag- and keyboard-orderable list.
 * `source: 'roster'` ranks the other players — the old "beef" list — and is
 * resolved per respondent so nobody ranks themselves.
 */
export type RankQuestion = Base & {
	type: 'rank';
	source: { kind: 'fixed'; options: Choice[] } | { kind: 'roster'; excludeSelf?: boolean };
	/** Copy for the top and bottom of the ladder, e.g. "most beef" / "least". */
	topLabel?: string;
	bottomLabel?: string;
	/** Tint rows from hot to cold by rank. Purely decorative. */
	heatmap?: boolean;
};

/**
 * The draft-availability grid: rank the windows, mark individual slots you
 * can't do, and optionally say how you'd attend each window.
 */
export type AvailabilityQuestion = Base & {
	type: 'availability';
	windows: { id: string; label: string; slots: { id: string; label: string }[] }[];
	/** Per-window attendance mode, shown only when `modeShowIf` passes. */
	mode?: { options: Choice[]; showIf?: ShowIf; prompt: string };
};

/**
 * Split 100% across N buckets, plus an optional carve-out.
 * The old prize-pool builder, generalised.
 */
export type AllocationQuestion = Base & {
	type: 'allocation';
	/** Total that must be hit exactly. */
	total: number;
	step: number;
	minBuckets: number;
	maxBuckets: number;
	/** Preset splits keyed by bucket count. */
	templates: Record<number, number[]>;
	defaultBuckets: number;
	/** Rendered as "1st <noun>", "2nd <noun>", … Definitions stay pure data so
	    they can be serialised straight to the client — no functions in here. */
	bucketNoun: string;
	/** An extra bucket outside the ranked places, e.g. regular-season leader. */
	carveOut?: { id: string; label: string; sub?: string; default: number };
	/** Question id whose answer gives the per-person dollar figure, for preview. */
	amountFrom?: string;
	/** Let people opt out entirely. */
	allowAbstain?: { label: string };
};

/**
 * Rank the top K from a shared, growing pool of options.
 * Options live in the `ballot_option` table with STABLE ids — the old site
 * derived ids from a normalisation of the option text, so editing a
 * punishment silently invalidated every ranking that referenced it.
 */
export type BallotQuestion = Base & {
	type: 'ballot';
	podiumSize: number;
	/** Points awarded to 1st, 2nd, 3rd… */
	points: number[];
	writeIn?: { label: string; placeholder?: string; maxLength?: number };
	/** Seed options that always appear first, marked as the official shortlist. */
	commissionerOptions?: string[];
	/** Pull free-text answers from another survey's question into the pool. */
	importFrom?: { survey: string; question: string };
};

/**
 * The rivalry mechanic. Each player writes only their own row; agreement is
 * derived by comparing the pair, never stored. Lives in `negotiation_entry`,
 * not in `response.answers`, because it is pairwise rather than per-player.
 */
export type NegotiationQuestion = Base & {
	type: 'negotiation';
	fields: {
		key: string;
		tag: string;
		short: string;
		prompt: string;
		help: string;
		placeholder: string;
	}[];
};

export type Question =
	| SingleQuestion
	| MultiQuestion
	| TextQuestion
	| RankQuestion
	| AvailabilityQuestion
	| AllocationQuestion
	| BallotQuestion
	| NegotiationQuestion;

export type QuestionType = Question['type'];

/** A titled group of questions — the old "1st Down / 2nd Down" sections. */
export type Section = {
	id: string;
	tag: string;
	title: string;
	blurb?: string;
	questions: Question[];
};

export type SurveyDefinition = {
	id: string;
	title: string;
	short: string;
	blurb: string;
	/** Shown on the hub card and at the top of the survey. */
	intro?: string;
	/** Copy for the submit button and the success stamp. */
	submitLabel: string;
	successStamp: string;
	successNote: string;
	sections: Section[];
};

/** Every question in a survey, flattened, in document order. */
export function allQuestions(def: SurveyDefinition): Question[] {
	return def.sections.flatMap((s) => s.questions);
}

export function questionById(def: SurveyDefinition, id: string): Question | undefined {
	return allQuestions(def).find((q) => q.id === id);
}

/**
 * Whether a question is answerable given the answers so far.
 * Used by both the renderer and the validator, so a hidden question can never
 * be "required" — the old form had no conditionals and hardcoded the one case
 * it needed (out-of-towners only) directly into the markup.
 */
export function isVisible(q: Question, answers: Record<string, unknown>): boolean {
	return showIfPasses(q.showIf, answers);
}

export function showIfPasses(
	cond: ShowIf | undefined,
	answers: Record<string, unknown>
): boolean {
	if (!cond) return true;
	const given = answers[cond.question] as { choice?: string } | undefined;
	if ('answered' in cond) return given !== undefined && given !== null;
	// Only `single` answers are usable as conditions, and they are objects.
	return given?.choice === cond.equals;
}
