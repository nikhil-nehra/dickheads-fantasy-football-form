/* ═══════════════════════════════════════════════════════════════════════════
   DRAFT DAY
   ═══════════════════════════════════════════════════════════════════════════
   Two clocks and one running order.

   The draft date is NOT in this file. It is whatever Sleeper says it is —
   the commissioner moves it in the Sleeper app, the sync worker caches
   `/v1/draft/<id>` under the `draft` key, and the board reads that. Anything
   typed in here would be a second source of truth that drifts the first time
   somebody nudges the start time by an hour and forgets to open the repo.

   What IS in here is the burger challenge, because Sleeper has no idea it
   happened. Times are hand-entered from the stopwatch; a new one is a
   one-line diff below and a push.
   ═══════════════════════════════════════════════════════════════════════════ */

/** Everyone is in Dallas or on Dallas time for this. Both clocks read Central. */
export const LEAGUE_TZ = 'America/Chicago';

/**
 * The burger challenge deadline: midnight at the END of Aug 31, Central —
 * which is the first instant of Sep 1. Written as UTC so it means exactly one
 * moment regardless of where the reader is; CDT is UTC-5 on that date.
 */
export const CHALLENGE_CLOSES = Date.parse('2026-09-01T05:00:00Z');

export type ChallengeRun = {
	playerId: string;
	/** m:ss.hh, exactly as it read on the stopwatch. */
	clock: string;
};

/**
 * Finished runs, fastest first — though the order here is cosmetic, since
 * `draftOrder` sorts. Anyone on the roster without a row is still eating.
 */
export const CHALLENGE_RUNS: readonly ChallengeRun[] = [
	{ playerId: 'rayyan-ali', clock: '0:36.00' },
	{ playerId: 'nikhil-nehra', clock: '0:49.70' },
	{ playerId: 'sean-vargeese', clock: '0:58.90' },
	{ playerId: 'jaswin-jabbal', clock: '1:32.64' },
	{ playerId: 'stephen-comeaux', clock: '1:39.47' },
	{ playerId: 'matthew-yoshida', clock: '3:44.94' },
	{ playerId: 'aidan-duncan', clock: '9:28.34' }
];

/* ── Clocks ──────────────────────────────────────────────────────────────── */

/**
 * `m:ss.hh` (or `h:mm:ss.hh`) into hundredths of a second. Returns null on
 * anything it does not recognise, so a typo in the table above shows up as one
 * missing row rather than silently sorting to the front.
 */
export function parseClock(clock: string): number | null {
	const parts = clock.trim().split(':');
	if (parts.length < 2 || parts.length > 3) return null;

	let total = 0;
	for (let i = 0; i < parts.length - 1; i++) {
		const n = Number(parts[i]);
		if (!Number.isFinite(n) || n < 0) return null;
		total = total * 60 + n;
	}

	const secs = Number(parts[parts.length - 1]);
	if (!Number.isFinite(secs) || secs < 0 || secs >= 60) return null;

	return Math.round((total * 60 + secs) * 100);
}

/** Hundredths back to `m:ss.hh`. */
export function formatClock(hundredths: number): string {
	const total = Math.max(0, Math.round(hundredths));
	const minutes = Math.floor(total / 6000);
	const seconds = Math.floor((total % 6000) / 100);
	const rest = total % 100;
	return `${minutes}:${String(seconds).padStart(2, '0')}.${String(rest).padStart(2, '0')}`;
}

/* ── The running order ───────────────────────────────────────────────────── */

export type RosterEntry = { id: string; display_name: string };

export type DraftPick = {
	pick: number;
	playerId: string;
	name: string;
	clock: string;
	hundredths: number;
	/** 0–100, this run measured against the slowest finished run. */
	pct: number;
};

export type DraftOrder = {
	picks: DraftPick[];
	/** Still eating, in roster order. */
	pending: RosterEntry[];
};

/**
 * Fastest burger picks first. Ties fall back to roster order, which is stable
 * and at least nobody's fault.
 *
 * A run whose player id is not on the roster is kept and labelled with the raw
 * id — a typo in CHALLENGE_RUNS should be visible on the board, not swallowed.
 *
 * Two runs for the same player collapse to their fastest, which also keeps the
 * returned ids unique: the board keys its list on them, and a duplicate key is
 * a rendering error rather than a wrong number.
 */
export function draftOrder(
	roster: readonly RosterEntry[],
	runs: readonly ChallengeRun[] = CHALLENGE_RUNS
): DraftOrder {
	const nameOf = new Map(roster.map((p) => [p.id, p.display_name]));
	const seat = new Map(roster.map((p, i) => [p.id, i]));

	const finished = runs
		.map((r) => ({ run: r, hundredths: parseClock(r.clock) }))
		.filter((r): r is { run: ChallengeRun; hundredths: number } => r.hundredths !== null)
		.sort(
			(a, b) =>
				a.hundredths - b.hundredths ||
				(seat.get(a.run.playerId) ?? Infinity) - (seat.get(b.run.playerId) ?? Infinity)
		);

	// Sorted first, so the survivor of a duplicate is the faster attempt.
	const best = new Map<string, (typeof finished)[number]>();
	for (const f of finished) {
		if (!best.has(f.run.playerId)) best.set(f.run.playerId, f);
	}
	const ranked = [...best.values()];

	const slowest = ranked.length ? ranked[ranked.length - 1].hundredths : 0;

	const picks = ranked.map((f, i) => ({
		pick: i + 1,
		playerId: f.run.playerId,
		name: nameOf.get(f.run.playerId) ?? f.run.playerId,
		clock: formatClock(f.hundredths),
		hundredths: f.hundredths,
		pct: slowest ? Math.max(3, Math.round((f.hundredths / slowest) * 100)) : 0
	}));

	const done = new Set(picks.map((p) => p.playerId));
	return { picks, pending: roster.filter((p) => !done.has(p.id)) };
}

/* ── Countdowns ──────────────────────────────────────────────────────────── */

export type Countdown = {
	/** Milliseconds left, floored at zero. */
	left: number;
	days: number;
	hours: number;
	minutes: number;
	seconds: number;
	/** True once the moment has passed. */
	done: boolean;
};

export function countdown(from: number, to: number): Countdown {
	const left = Math.max(0, to - from);
	const s = Math.floor(left / 1000);
	return {
		left,
		days: Math.floor(s / 86400),
		hours: Math.floor((s % 86400) / 3600),
		minutes: Math.floor((s % 3600) / 60),
		seconds: s % 60,
		done: to - from <= 0
	};
}

/** Whole days remaining, rounded up — what the link preview quotes. */
export function daysOut(from: number, to: number): number {
	return Math.max(0, Math.ceil((to - from) / 86_400_000));
}

/* ── Display ─────────────────────────────────────────────────────────────── */

/**
 * A moment in league time. Formatted on the SERVER and shipped as a string, so
 * the reader in another timezone sees the same words as everyone else and
 * hydration has nothing to disagree about.
 */
export function leagueTime(ms: number, opts: { year?: boolean } = {}): string {
	return new Intl.DateTimeFormat('en-US', {
		timeZone: LEAGUE_TZ,
		weekday: 'short',
		month: 'short',
		day: 'numeric',
		// Off by default: the draft is weeks away and the year is noise. On for
		// anything far enough out that "Feb 14" alone is a question.
		year: opts.year ? 'numeric' : undefined,
		hour: 'numeric',
		minute: '2-digit',
		timeZoneName: 'short'
	}).format(new Date(ms));
}
