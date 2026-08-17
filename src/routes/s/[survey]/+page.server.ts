import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { surveyById } from '$lib/surveys';
import { allQuestions } from '$lib/surveys/types';
import { withDefaults } from '$lib/surveys/defaults';
import { STATUS_META } from '$lib/status';
import {
	listPlayers,
	listSurveyStates,
	getResponse,
	listBallotOptions,
	pairingFor,
	listNegotiation,
	listRulings,
	type SurveyStatus
} from '$lib/server/db';

export const load: PageServerLoad = async ({ params, url, platform, locals }) => {
	const def = surveyById(params.survey);
	if (!def) error(404, 'No such survey.');

	const db = platform!.env.DB;
	const season = platform!.env.SEASON ?? '2026';

	const states = await listSurveyStates(db);
	const status = (states[def.id]?.status ?? 'draft') as SurveyStatus;

	// A draft survey is not just hidden from the hub — its page is unreachable
	// too. The old site hid the card but left the page and all of its data
	// fully public.
	if (status === 'draft' && !locals.isCommissioner) error(404, 'No such survey.');

	const players = await listPlayers(db);

	// Identity lives in the URL, so refreshing keeps you signed in as yourself,
	// the page server-renders your saved answers with no flash of an empty
	// form, and picking a name works with JavaScript disabled.
	const asParam = url.searchParams.get('as');
	const me = players.find((p) => p.id === asParam) ?? null;

	const saved = me ? await getResponse(db, def.id, me.id) : null;
	let answers: Record<string, unknown> = {};
	if (saved) {
		try {
			answers = JSON.parse(saved.answers);
		} catch {
			answers = {};
		}
	}
	if (me) {
		// Fill ordered lists and the prize template server-side so the first
		// paint is already complete.
		answers = withDefaults(def, answers, {
			playerId: me.id,
			rosterIds: players.map((p) => p.id)
		});
	}

	// Ballot pools, per ballot question.
	const ballots: Record<
		string,
		{
			id: string;
			text: string;
			source: 'commissioner' | 'imported' | 'writein';
			suggestedBy: string | null;
		}[]
	> = {};
	for (const q of allQuestions(def)) {
		if (q.type !== 'ballot') continue;
		const rows = await listBallotOptions(db, def.id, q.id);
		const nameOf = new Map(players.map((p) => [p.id, p.display_name]));
		ballots[q.id] = rows.map((r) => ({
			id: r.id,
			text: r.text,
			source: r.source,
			suggestedBy: r.suggested_by ? (nameOf.get(r.suggested_by) ?? null) : null
		}));
	}

	// Pairwise negotiation state, if this survey has a negotiation question.
	let negotiation = null;
	const negQ = allQuestions(def).find((q) => q.type === 'negotiation');
	if (negQ && me) {
		const pairing = await pairingFor(db, season, me.id);
		if (pairing) {
			const rivalId = pairing.a_player_id === me.id ? pairing.b_player_id : pairing.a_player_id;
			const rival = players.find((p) => p.id === rivalId) ?? null;
			const entries = await listNegotiation(db, [pairing.id]);
			const rulings = (await listRulings(db)).filter((r) => r.pairing_id === pairing.id);
			negotiation = {
				pairingId: pairing.id,
				rival: rival ? { id: rival.id, name: rival.display_name } : null,
				mine: entries.filter((e) => e.player_id === me.id),
				theirs: entries.filter((e) => e.player_id === rivalId),
				rulings
			};
		}
	}

	return {
		def,
		status,
		statusMeta: STATUS_META[status],
		players: players.map((p) => ({ id: p.id, display_name: p.display_name })),
		me: me ? { id: me.id, display_name: me.display_name } : null,
		answers,
		hasSaved: !!saved,
		savedAt: saved?.updated_at ?? null,
		ballots,
		negotiation,
		isCommissioner: locals.isCommissioner
	};
};
