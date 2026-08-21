/* ═══════════════════════════════════════════════════════════════════════════
   THE BOARDS
   ═══════════════════════════════════════════════════════════════════════════
   "Surveys close. Boards are forever."

   A board is a permanent, public, read-only view of results. It deliberately
   never consults survey status — that is what makes a link pasted into
   Sleeper league chat safe to leave there for the rest of the season.

   In the old site that was a convention held by a comment. Here the board
   loaders simply never read `survey.status`, and a test asserts a board still
   renders after its survey is archived.
   ═══════════════════════════════════════════════════════════════════════════ */

export type BoardDefinition = {
	id: string;
	title: string;
	blurb: string;
	/** Which survey (or 'sleeper') the data comes from. Display only. */
	from: string;
	/** Copy used for the link preview when this board is pasted into chat. */
	og: { title: string; description: string };
};

export const BOARDS: BoardDefinition[] = [
	{
		id: 'rivalry',
		title: 'The Rivalry Board',
		from: 'rivalry',
		blurb:
			'Every agreed rivalry name, bet and side punishment. This is the one to paste in Sleeper.',
		og: {
			title: 'The Rivalry Board',
			description: 'Every rivalry name, bet and side punishment — settled, ruled or still in dispute.'
		}
	},
	{
		id: 'draft',
		title: 'Draft Day',
		// Sleeper owns the date; the running order is bought with a burger.
		// Neither of those is survey data, and the intake answers this board
		// used to publish are now Desk-only.
		from: 'sleeper',
		blurb:
			'The countdown to first pick, and the draft order as the burger challenge has left it.',
		og: {
			title: 'Draft Day',
			description: 'The countdown to first pick and the running order, earned one burger at a time.'
		}
	},
	{
		id: 'pot',
		title: 'The Pot',
		from: 'intake',
		blurb: 'The buy-in that won, the total pot, and the prize split in real dollars.',
		og: {
			title: 'The Pot',
			description: 'The winning buy-in, the projected pot, and the crowdsourced prize split.'
		}
	},
	{
		id: 'standings',
		title: 'Standings',
		from: 'sleeper',
		blurb: 'Live records, points for and against, straight from Sleeper.',
		og: {
			title: 'Standings',
			description: 'Live records and points, pulled from Sleeper.'
		}
	}
];

export function boardById(id: string): BoardDefinition | undefined {
	return BOARDS.find((b) => b.id === id);
}
