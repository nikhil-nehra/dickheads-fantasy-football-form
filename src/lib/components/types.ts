/** A row in an orderable list. Shared by RankList and its callers. */
export type RankItem = { id: string; label: string; sub?: string };

/** A ballot option as the client sees it — id is stable and opaque. */
export type BallotOption = {
	id: string;
	text: string;
	source: 'commissioner' | 'imported' | 'writein';
	suggestedBy?: string | null;
};
