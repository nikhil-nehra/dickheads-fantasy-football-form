import type { PageServerLoad } from './$types';
import { listPlayers, listSurveyStates, responseCounts, ensureSurveys } from '$lib/server/db';
import { SURVEYS } from '$lib/surveys';
import { BOARDS } from '$lib/boards';
import { STATUS_META } from '$lib/status';

export const load: PageServerLoad = async ({ platform, locals }) => {
	const db = platform!.env.DB;

	// A survey declared in code but missing from the database would otherwise
	// have no status at all. Registering it costs one no-op upsert per boot.
	await ensureSurveys(
		db,
		SURVEYS.map((s) => s.id)
	);

	const [players, states, counts] = await Promise.all([
		listPlayers(db),
		listSurveyStates(db),
		responseCounts(db)
	]);

	return {
		rosterSize: players.length,
		isCommissioner: locals.isCommissioner,
		// Counts are looked up per registered survey — no survey id is hardcoded
		// anywhere, which is what the old hub got wrong.
		//
		// Draft surveys are filtered out HERE rather than in the component, so a
		// title the league isn't meant to see yet never reaches the browser at
		// all — not even in the serialised load payload.
		surveys: SURVEYS.map((def) => ({
			id: def.id,
			title: def.title,
			blurb: def.blurb,
			status: states[def.id]?.status ?? 'draft',
			count: counts[def.id] ?? 0
		})).filter((s) => STATUS_META[s.status].listed || locals.isCommissioner),
		boards: BOARDS.map((b) => ({ id: b.id, title: b.title, blurb: b.blurb }))
	};
};
