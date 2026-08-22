import {
	ensureBallotOption,
	listResponses,
	listBallotOptions,
	pruneCommissionerOptions,
	norm
} from './db';
import { allQuestions, type SurveyDefinition } from '$lib/surveys/types';
import { surveyById } from '$lib/surveys';

/* ═══════════════════════════════════════════════════════════════════════════
   BALLOT POOL
   ═══════════════════════════════════════════════════════════════════════════
   Materialises a ballot question's option pool into `ballot_option` rows.

   The old site rebuilt this pool on every render, in the browser, from
   everyone's raw answers — and derived each option's ID from a normalisation
   of its own text. That meant fixing a typo in a Survey 1 punishment silently
   invalidated every podium that pointed at it, and those rankings rendered as
   "(removed option)".

   Materialising once, with random ids and a UNIQUE constraint on normalised
   text, makes both problems go away: ids never change, and de-duplication is
   the database's job.
   ═══════════════════════════════════════════════════════════════════════════ */

export type BallotSync = {
	added: number;
	removed: number;
	/** Options cut from the shortlist that a cast ballot still points at. */
	kept: string[];
};

export async function syncBallotOptions(
	db: D1Database,
	def: SurveyDefinition
): Promise<BallotSync> {
	let added = 0;
	let removed = 0;
	const kept: string[] = [];

	for (const q of allQuestions(def)) {
		if (q.type !== 'ballot') continue;

		const before = (await listBallotOptions(db, def.id, q.id)).length;

		for (const text of q.commissionerOptions ?? []) {
			await ensureBallotOption(db, {
				surveyId: def.id,
				questionId: q.id,
				text,
				source: 'commissioner'
			});
		}

		if (q.importFrom) {
			const sourceDef = surveyById(q.importFrom.survey);
			if (sourceDef) {
				const rows = await listResponses(db, sourceDef.id);
				for (const row of rows) {
					let answers: Record<string, unknown>;
					try {
						answers = JSON.parse(row.answers);
					} catch {
						continue;
					}
					const text = answers[q.importFrom.question];
					if (typeof text !== 'string' || !text.trim()) continue;

					await ensureBallotOption(db, {
						surveyId: def.id,
						questionId: q.id,
						text,
						source: 'imported',
						suggestedBy: row.player_id
					});
				}
			}
		}

		/* Then take the superseded shortlist back off — see src/lib/ballotPool.ts.

		   After the inserts, never before, so an option that survived the edit is
		   matched by its normalised text rather than deleted and re-created,
		   which would hand it a new id and orphan every podium pointing at the
		   old one. */
		const ranked = new Set<string>();
		for (const row of await listResponses(db, def.id)) {
			let answers: Record<string, unknown>;
			try {
				answers = JSON.parse(row.answers);
			} catch {
				continue;
			}
			const podium = answers[q.id];
			if (Array.isArray(podium)) {
				for (const id of podium) if (typeof id === 'string') ranked.add(id);
			}
		}

		const prune = await pruneCommissionerOptions(
			db,
			def.id,
			q.id,
			(q.commissionerOptions ?? []).map(norm),
			ranked
		);
		removed += prune.removed;
		kept.push(...prune.kept);

		added += (await listBallotOptions(db, def.id, q.id)).length - before + prune.removed;
	}

	return { added, removed, kept };
}
