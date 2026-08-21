import type { SurveyDefinition } from './types';

/* ═══════════════════════════════════════════════════════════════════════════
   SURVEY 2 — RIVALRY WEEK & THE PUNISHMENT
   ═══════════════════════════════════════════════════════════════════════════
   Copy lifted verbatim from the original rivalry.html.

   The negotiation section is the one part of the old site whose concurrency
   model was already correct: each player writes only their own row and
   "agreed" is derived by comparing the pair. That is preserved exactly — and
   is now enforced by a primary key rather than by a comment.
   ═══════════════════════════════════════════════════════════════════════════ */

export const rivalry: SurveyDefinition = {
	id: 'rivalry',
	title: 'Rivalry Week & The Punishment',
	short: 'Rivalry Week',
	blurb:
		'Vote on the punishment and who serves it, then settle your rivalry in writing.',
	submitLabel: 'Save my answers',
	successStamp: 'ON THE\nRECORD',
	successNote: 'Your ballot is in. Your rivalry keeps updating until you both agree.',

	sections: [
		{
			id: 'punishment',
			tag: '1ST DOWN · THE PUNISHMENT',
			title: 'The punishment',
			questions: [
				{
					id: 'podium',
					type: 'ballot',
					prompt: 'Rank your top 3 punishments',
					help:
						'Tap them in order of preference — first tap is your 1st choice. Scoring is 3/2/1 points, so your top pick carries the most weight.',
					required: true,
					podiumSize: 3,
					points: [3, 2, 1],
					writeIn: {
						label: 'Write in your own',
						placeholder:
							'Your own diabolical suggestion — it joins the ballot for everyone once you save',
						maxLength: 400
					},
					// Your official shortlist. These render first, marked ★.
					commissionerOptions: [],
					// Every free-text punishment idea from Survey 1 joins the pool,
					// de-duplicated by a UNIQUE constraint rather than a client pass.
					importFrom: { survey: 'intake', question: 'punishment' }
				}
			]
		},

		{
			id: 'victim',
			tag: '2ND DOWN · THE VICTIM',
			title: 'The victim',
			questions: [
				{
					id: 'target',
					type: 'single',
					prompt: 'Who actually has to do the punishment?',
					help:
						"Pick one. This is the part people always argue about in January, so let's settle it in August.",
					required: true,
					layout: 'list',
					options: [
						{
							id: 'reg-last',
							label: 'Last place — regular season',
							sub: 'Worst record when the regular season ends, playoffs be damned'
						},
						{
							id: 'toilet',
							label: 'Loser of the consolation bracket',
							sub: "Whoever loses the toilet bowl / loser's playoff final"
						},
						{
							id: 'final-last',
							label: 'Last place — final standings',
							sub: 'After every playoff and consolation game is done'
						},
						{
							id: 'fewest-pts',
							label: 'Fewest total points scored',
							sub: 'Whole season. Bad luck is no excuse.'
						},
						{
							id: 'both',
							label: 'Both — reg season AND toilet bowl',
							sub: 'Two punishments, two victims. Double the content.'
						}
					],
					writeIn: { label: 'Something else', placeholder: 'Then who?', maxLength: 200 }
				}
			]
		},

		{
			id: 'negotiation',
			tag: '3RD DOWN · RIVALRY WEEK',
			title: 'Your rivalry',
			blurb:
				'You both propose, you both see everything, and each line only locks when the **two of you land on the same answer**. ' +
				'You can back your own idea, back theirs, or write a third option you both prefer.',
			questions: [
				{
					id: 'negotiation',
					type: 'negotiation',
					prompt: 'Settle it',
					required: false,
					fields: [
						{
							key: 'rname',
							tag: 'RIVALRY NAME',
							short: 'Rivalry name',
							kind: 'name',
							prompt: 'What is this rivalry called?',
							help:
								'The name that goes on the Rivalry Board and in the league chat forever. Make it hurt.',
							placeholder: 'e.g. The Battle for the Last Brain Cell'
						},
						{
							key: 'bet',
							tag: 'THE SET BET',
							short: 'The bet',
							kind: 'money',
							prompt: 'How much is on your head-to-head?',
							help:
								'A dollar amount, paid by the loser to the winner. Anything you want the loser to **do** goes in the side punishment below.',
							placeholder: '20'
						},
						{
							key: 'side',
							tag: 'SIDE PUNISHMENT',
							short: 'Side punishment',
							kind: 'text',
							prompt: 'What does the loser of your matchup have to do?',
							help:
								'Separate from the league-wide punishment. This one is just between you two.',
							placeholder: "e.g. Loser makes the winner's team name their own for a week"
						}
					]
				}
			]
		}
	]
};
