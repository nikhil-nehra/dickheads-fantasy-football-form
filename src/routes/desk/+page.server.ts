import type { PageServerLoad } from './$types';
import { SURVEYS } from '$lib/surveys';
import { allQuestions } from '$lib/surveys/types';
import {
	listPlayers,
	listSurveyStates,
	listResponses,
	listBallotOptions,
	listPairings,
	listNegotiation,
	listRulings,
	recentAudit,
	ensureSurveys,
	getPotConfig,
	getPunishment,
	listPayments
} from '$lib/server/db';
import { pairingProblems } from '$lib/pairing';
import { suggestAll, type SleeperAccount } from '$lib/sleeperMatch';
import { readSleeper, type SleeperUser } from '$lib/server/sleeper';
import { SUGGESTED_SPLIT } from '$lib/pot';

export const load: PageServerLoad = async ({ platform, locals }) => {
	// Nothing beyond "you are not logged in" is loaded for a stranger, so the
	// Desk leaks no league data before the PIN is accepted.
	if (!locals.isCommissioner) {
		return { authed: false as const };
	}

	const db = platform!.env.DB;
	const season = platform!.env.SEASON ?? '2026';

	await ensureSurveys(
		db,
		SURVEYS.map((s) => s.id)
	);

	const [players, states, pairings, rulings, audit, punishment] = await Promise.all([
		listPlayers(db),
		listSurveyStates(db),
		listPairings(db, season),
		listRulings(db),
		recentAudit(db, 30),
		getPunishment(db, season)
	]);

	const nameOf = new Map(players.map((p) => [p.id, p.display_name]));

	// Built by walking the registry, so a third survey gets a full tab with no
	// code change. The old Desk dispatched tabs through a hardcoded ternary and
	// silently rendered the rivalry tab for anything it didn't recognise.
	const surveys = await Promise.all(
		SURVEYS.map(async (def) => {
			const rows = await listResponses(db, def.id);

			const ballots: Record<string, { id: string; text: string }[]> = {};
			for (const q of allQuestions(def)) {
				if (q.type !== 'ballot') continue;
				ballots[q.id] = (await listBallotOptions(db, def.id, q.id)).map((o) => ({
					id: o.id,
					text: o.text
				}));
			}

			return {
				def,
				status: states[def.id]?.status ?? 'draft',
				changedAt: states[def.id]?.changed_at ?? null,
				ballots,
				submissions: rows.map((r) => {
					let answers: Record<string, unknown> = {};
					try {
						answers = JSON.parse(r.answers);
					} catch {
						answers = {};
					}
					return {
						playerId: r.player_id,
						playerName: nameOf.get(r.player_id) ?? r.player_id,
						updatedAt: r.updated_at,
						answers
					};
				})
			};
		})
	);

	const entries = await listNegotiation(
		db,
		pairings.map((p) => p.id)
	);

	// Sleeper accounts, from the sync worker's cached snapshot — never fetched
	// on a page load.
	const cachedUsers = (await readSleeper<SleeperUser[]>(db, 'users')) ?? [];
	const cachedRosters =
		(await readSleeper<{ roster_id: number; owner_id: string | null }[]>(db, 'rosters')) ?? [];
	const rosterOf = new Map(cachedRosters.map((r) => [r.owner_id ?? '', r.roster_id]));

	const accounts: SleeperAccount[] = cachedUsers.map((u) => ({
		userId: u.userId,
		displayName: u.displayName,
		teamName: u.teamName,
		rosterId: rosterOf.get(u.userId) ?? null
	}));

	const linked = new Set(players.map((p) => p.sleeper_user_id).filter(Boolean) as string[]);
	const unlinkedPlayers = players.filter((p) => !p.sleeper_user_id);
	const suggestions = suggestAll(
		unlinkedPlayers.map((p) => ({ id: p.id, display_name: p.display_name })),
		accounts.filter((a) => !linked.has(a.userId))
	);

	// The pot: the buy-in, the split, and who has handed money over. All three
	// are commissioner-set facts, so they share one tab.
	const pot = await getPotConfig(db, season);
	const payments = await listPayments(db, season);
	const paidIds = new Set(payments.filter((p) => p.paid === 1).map((p) => p.player_id));

	return {
		authed: true as const,
		season,
		pot: {
			buyIn: pot.buyIn,
			// A blank split editor is a worse starting point than a sensible one
			// nobody has committed to yet.
			split: pot.split.length ? pot.split : SUGGESTED_SPLIT,
			saved: pot.split.length > 0 || pot.buyIn > 0
		},
		paidIds: [...paidIds],
		sleeper: {
			accounts,
			suggestions,
			fetchedAt: (await readSleeper<{ at: string }>(db, 'meta'))?.at ?? null
		},
		players: players.map((p) => ({
			id: p.id,
			display_name: p.display_name,
			sleeperUserId: p.sleeper_user_id,
			sleeperRosterId: p.sleeper_roster_id
		})),
		surveys,
		pairings: pairings.map((p) => ({
			id: p.id,
			a: p.a_player_id,
			b: p.b_player_id,
			aName: nameOf.get(p.a_player_id) ?? p.a_player_id,
			bName: nameOf.get(p.b_player_id) ?? p.b_player_id,
			source: p.source
		})),
		negotiation: entries,
		rulings,
		punishment,
		problems: pairingProblems(
			players.map((p) => p.id),
			pairings.map((p) => [p.a_player_id, p.b_player_id] as [string, string])
		),
		audit
	};
};
