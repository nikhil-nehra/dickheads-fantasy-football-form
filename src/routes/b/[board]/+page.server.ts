import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { boardById } from '$lib/boards';
import { surveyById } from '$lib/surveys';
import { allQuestions } from '$lib/surveys/types';
import {
	listPlayers,
	listResponses,
	listBallotOptions,
	listPairings,
	listNegotiation,
	listRulings,
	getPotConfig,
	listPayments
} from '$lib/server/db';
import {
	readSleeper,
	resolveVictim,
	type SleeperDraft,
	type StandingsRow
} from '$lib/server/sleeper';
import { CHALLENGE_CLOSES, daysOut, draftOrder, leagueTime } from '$lib/draft';
import { ledger, payouts } from '$lib/pot';

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

	if (board.id === 'rivalry') {
		const pairings = await listPairings(db, season);
		const entries = await listNegotiation(
			db,
			pairings.map((p) => p.id)
		);
		const rulings = await listRulings(db);
		const def = surveyById(board.from);
		const negQ = def ? allQuestions(def).find((q) => q.type === 'negotiation') : undefined;

		// The punishment verdict, and — where Sleeper can settle it — who is
		// actually on the hook for it. Three of the five options are now a
		// straight read off the standings instead of a January argument.
		let verdict: {
			punishment: string | null;
			target: string;
			targetLabel: string;
			who: string | null;
		} | null = null;

		if (def) {
			const rows = await listResponses(db, def.id);
			const submissions = rows.map((r) => {
				try {
					return JSON.parse(r.answers) as Record<string, unknown>;
				} catch {
					return {};
				}
			});

			const ballotQ = allQuestions(def).find((q) => q.type === 'ballot');
			const targetQ = allQuestions(def).find((q) => q.type === 'single');

			let punishment: string | null = null;
			if (ballotQ && ballotQ.type === 'ballot') {
				const opts = await listBallotOptions(db, def.id, ballotQ.id);
				const text = new Map(opts.map((o) => [o.id, o.text]));
				const points = new Map<string, number>();
				for (const a of submissions) {
					const podium = a[ballotQ.id];
					if (!Array.isArray(podium)) continue;
					podium.forEach((id: string, i: number) =>
						points.set(id, (points.get(id) ?? 0) + (ballotQ.points[i] ?? 0))
					);
				}
				const winner = [...points.entries()].sort((x, y) => y[1] - x[1])[0];
				punishment = winner ? (text.get(winner[0]) ?? null) : null;
			}

			if (targetQ && targetQ.type === 'single') {
				const counts = new Map<string, number>();
				for (const a of submissions) {
					const choice = (a[targetQ.id] as { choice?: string } | undefined)?.choice;
					if (choice) counts.set(choice, (counts.get(choice) ?? 0) + 1);
				}
				const top = [...counts.entries()].sort((x, y) => y[1] - x[1])[0];
				if (top) {
					const standings = await readSleeper<StandingsRow[]>(db, 'standings');
					const brackets = await readSleeper<{ losers?: { r?: number; l?: number }[] }>(
						db,
						'brackets'
					);
					const nameOfRoster = (rosterId: number) =>
						standings?.find((s) => s.rosterId === rosterId)?.displayName ?? `Roster ${rosterId}`;

					const resolved = resolveVictim(
						top[0],
						standings,
						brackets?.losers ?? null,
						nameOfRoster
					);
					const declared = targetQ.options.find((o) => o.id === top[0]);
					verdict = {
						punishment,
						target: top[0],
						targetLabel: declared?.label ?? resolved.label,
						who: resolved.who
					};
				}
			}

			if (!verdict && punishment) {
				verdict = { punishment, target: '', targetLabel: '', who: null };
			}
		}

		return {
			...base,
			kind: 'rivalry' as const,
			verdict,
			fields: negQ && negQ.type === 'negotiation' ? negQ.fields : [],
			pairings: pairings.map((p) => ({
				id: p.id,
				aName: nameOf.get(p.a_player_id) ?? p.a_player_id,
				bName: nameOf.get(p.b_player_id) ?? p.b_player_id,
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
