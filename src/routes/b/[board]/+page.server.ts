import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { boardById } from '$lib/boards';
import { surveyById } from '$lib/surveys';
import { allQuestions } from '$lib/surveys/types';
import {
	listPlayers,
	listPairings,
	listNegotiation,
	listRulings,
	getPotConfig,
	getPunishment,
	listPayments
} from '$lib/server/db';
import {
	readSleeper,
	type SleeperDraft,
	type SleeperUser,
	type StandingsRow
} from '$lib/server/sleeper';
import { CHALLENGE_CLOSES, daysOut, draftOrder, leagueTime } from '$lib/draft';
import { ledger, payouts } from '$lib/pot';
import { SUPER_BOWL_KICKOFF, isRuled, isStandingDeadline } from '$lib/punishment';
import { atRisk, recordOf, riskState } from '$lib/standings';

/* ═══════════════════════════════════════════════════════════════════════════
   "Surveys close. Boards are forever."

   Note what this loader never does: read `survey.status`. A board renders
   identically whether its survey is open, closed or archived, which is what
   makes a link pasted into Sleeper league chat safe to leave there. In the old
   site that was a convention documented in a comment; here it is simply the
   absence of a status lookup, and a test asserts it.
   ═══════════════════════════════════════════════════════════════════════════ */

export const load: PageServerLoad = async ({ params, platform }) => {
	const board = boardById(params.board);
	if (!board) error(404, 'No such board.');

	const db = platform!.env.DB;
	const season = platform!.env.SEASON ?? '2026';

	const players = await listPlayers(db);
	const nameOf = new Map(players.map((p) => [p.id, p.display_name]));

	const base = {
		board,
		season,
		roster: players.map((p) => ({ id: p.id, display_name: p.display_name }))
	};

	/* ── The Punishment ──────────────────────────────────────────────────────
	   A ruling, not a tally. Note what this branch does NOT read: the ballot,
	   the victim vote, or a single response row.

	   It used to read all three and print them live — points moving under the
	   reader, a victim column that changed as people voted, a roast for whoever
	   had not. That is a survey readout wearing a board's clothes, and nobody
	   serves a punishment that is still being counted. The vote decides it on
	   the Desk, where the tally belongs and where the commissioner reads it; what
	   the league is HELD TO is four facts somebody set and can be quoted on.

	   The same correction The Pot had already had, for the same reason. */
	if (board.id === 'punishment') {
		const ruling = await getPunishment(db, season);

		/* A clock only where there is a moment to count to. The deadline is
		   free text — "by the Super Bowl" is what the league agreed, not a
		   timestamp — so the constant is used exactly when the commissioner has
		   left the standing deadline in place, and the words stand alone
		   otherwise. Counting down to a kickoff under the words "Week 18" would
		   be a confident lie. */
		const known = isStandingDeadline(ruling.deadline);

		/* Who is on the hook AS IT STANDS. Live from Sleeper, and deliberately not
		   the same claim as `ruling.victim`: that is the RULE ("last place,
		   toilet bowl"), this is the table underneath it today. Empty until
		   somebody has played a game — in August every row is 0-0-0, and sorting
		   that would accuse whoever happens to come first of losing a season
		   nobody has played.

		   Which leaves two different silences, and the section has to tell them
		   apart: nobody has PLAYED yet, and Sleeper has not been WIRED UP yet.
		   One is the calendar and one is a job for the commissioner, and a
		   section that renders the same nothing for both hides the second until
		   somebody notices the standings are missing in November. */
		const standings = (await readSleeper<StandingsRow[]>(db, 'standings')) ?? [];
		const worst = atRisk(standings);

		return {
			...base,
			kind: 'punishment' as const,
			ruling,
			ruled: isRuled(ruling),
			atRisk: worst.map((r) => ({
				rosterId: r.rosterId,
				name: r.displayName,
				record: recordOf(r),
				pointsFor: r.pointsFor
			})),
			// Named in $lib/standings alongside the definition of "worst", so the
			// reason for a silence is decided in the same place as the ranking.
			riskState: riskState(standings),
			/* Out of how many. "Bottom 3" means nothing without it, and it is the
			   difference between being last of fourteen and last of four. */
			teamCount: standings.length,
			// Server time, rendered as-is on the first client pass too, so
			// hydration has nothing to disagree about. See the draft board.
			now: Date.now(),
			deadlineAt: known ? SUPER_BOWL_KICKOFF : null,
			/* Formatted here rather than in the browser so a reader in another
			   timezone sees the same words as everyone in Dallas — and with the
			   year, because "Feb 14" seventeen months out is a question. */
			deadlineLabel: known ? leagueTime(SUPER_BOWL_KICKOFF, { year: true }) : null
		};
	}

	if (board.id === 'rivalry') {
		const pairings = await listPairings(db, season);
		const entries = await listNegotiation(
			db,
			pairings.map((p) => p.id)
		);
		const rulings = await listRulings(db);
		const def = surveyById(board.from);
		const negQ = def ? allQuestions(def).find((q) => q.type === 'negotiation') : undefined;
		const negFields = negQ && negQ.type === 'negotiation' ? negQ.fields : [];

		/* The card now leads with the TEAM, and names the human underneath — a
		   rivalry is between two franchises, and "Team Chaos vs The Bus Crew"
		   carries more than two people's legal names. The team name comes from
		   Sleeper (its own, or the handle if they never set one) and falls back
		   to the roster name for anybody not linked yet, so the header is never
		   blank. */
		const sleeperUsers = (await readSleeper<SleeperUser[]>(db, 'users')) ?? [];
		const teamOf = new Map(sleeperUsers.map((u) => [u.userId, u.teamName || u.displayName]));
		const linkOf = new Map(players.map((p) => [p.id, p.sleeper_user_id]));

		const teamFor = (playerId: string): string | null => {
			const userId = linkOf.get(playerId);
			return userId ? (teamOf.get(userId) ?? null) : null;
		};

		return {
			...base,
			kind: 'rivalry' as const,
			/* The name field is deliberately NOT in `fields`: it belongs to the
			   title card, and shipping it would put a "Rivalry name" row's label
			   in the page's hydration payload for a row that is never drawn.
			   `nameKey` is sent instead so the header stays data-driven rather
			   than hardcoding this survey's key. */
			nameKey: negFields.find((f) => f.kind === 'name')?.key ?? null,
			/* Same reasoning as `nameKey`, for the same reason: the colours are
			   the header's texture, not a row in the card body, so they are sent
			   as keys rather than as fields. In document order — the first colour
			   line a survey declares is the primary, the second the secondary,
			   which is how the definition reads top to bottom and how the pattern
			   spends them (checker, then teeth). */
			colorKeys: negFields.filter((f) => f.kind === 'color').map((f) => f.key),
			/* An 'own' line has no agreement to report, so it has no badge, no
			   "in dispute" and no place in the settled count that drives the
			   heat. Dropping it here keeps every one of those out of the payload
			   rather than teaching the card to skip it in four places. */
			fields: negFields
				.filter((f) => f.kind !== 'name' && f.mode !== 'own')
				.map((f) => ({ key: f.key, short: f.short, kind: f.kind ?? 'text' })),
			pairings: pairings.map((p) => ({
				id: p.id,
				aName: nameOf.get(p.a_player_id) ?? p.a_player_id,
				bName: nameOf.get(p.b_player_id) ?? p.b_player_id,
				aTeam: teamFor(p.a_player_id),
				bTeam: teamFor(p.b_player_id),
				a: entries.filter((e) => e.pairing_id === p.id && e.player_id === p.a_player_id),
				b: entries.filter((e) => e.pairing_id === p.id && e.player_id === p.b_player_id),
				rulings: rulings.filter((r) => r.pairing_id === p.id)
			}))
		};
	}

	if (board.id === 'standings') {
		return {
			...base,
			kind: 'standings' as const,
			standings: await readSleeper<StandingsRow[]>(db, 'standings'),
			fetchedAt: (await readSleeper<{ at: string }>(db, 'meta'))?.at ?? null
		};
	}

	if (board.id === 'draft') {
		// Two clocks and a running order. Note what is NOT here: a single read of
		// the intake survey. That board used to publish everyone's availability
		// grid; it is Desk-only now.
		const draft = await readSleeper<SleeperDraft>(db, 'draft');
		const syncedAt = await readSleeper<{ at: string }>(db, 'meta');
		const now = Date.now();
		const startsAt = draft?.startTime ?? null;
		const order = draftOrder(
			players.map((p) => ({ id: p.id, display_name: p.display_name }))
		);

		return {
			...base,
			kind: 'draft' as const,
			// Server time, rendered as-is on the first client pass too — the
			// ticking only starts after mount, so hydration has nothing to
			// disagree about.
			now,
			startsAt,
			// Formatted here rather than in the browser so a reader in another
			// timezone sees the same words as everyone in Dallas.
			startsAtLabel: startsAt ? leagueTime(startsAt) : null,
			daysOut: startsAt ? daysOut(now, startsAt) : null,
			draftType: draft?.type ?? null,
			rounds: draft?.rounds ?? null,
			pickTimer: draft?.pickTimer ?? null,
			challengeClosesAt: CHALLENGE_CLOSES,
			// The deadline is midnight; label it with the minute before it, or it
			// reads as a date nobody agreed to.
			challengeClosesLabel: leagueTime(CHALLENGE_CLOSES - 60_000),
			picks: order.picks,
			// Keyed by id on the board, not by name — two players sharing a
			// display name would be a duplicate-key render error.
			pending: order.pending.map((p) => ({ id: p.id, name: p.display_name })),
			// In league time like everything else on this board — the standings
			// board stamps raw UTC, but nothing else here speaks UTC.
			fetchedAt: (() => {
				const at = syncedAt?.at ? Date.parse(syncedAt.at) : NaN;
				return Number.isFinite(at) ? leagueTime(at) : null;
			})()
		};
	}

	/* ── The Pot ─────────────────────────────────────────────────────────────
	   No survey. Not one read.

	   Everything here is a commissioner-set fact: the buy-in and the split out
	   of `pot_config`, who has paid out of `payment`. The board used to publish
	   the buy-in VOTE — bars, vote counts, "from the 13 who answered" — and to
	   get them it shipped every raw intake submission to every visitor,
	   punishment write-ins and beef rankings included. Those answers are the
	   Desk's business. */
	if (board.id !== 'pot') error(404, 'No such board.');

	const [config, payments] = await Promise.all([
		getPotConfig(db, season),
		listPayments(db, season)
	]);

	const roll = ledger(players, payments, config.buyIn);
	const pot = config.buyIn * players.length;

	return {
		...base,
		kind: 'pot' as const,
		buyIn: config.buyIn,
		pot,
		collected: roll.collected,
		payouts: payouts(config.split, pot),
		paid: roll.paid,
		owing: roll.owing
	};
};
