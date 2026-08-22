import type { SurveyDefinition } from './types';

/* ═══════════════════════════════════════════════════════════════════════════
   SURVEY 2 — RIVALRY WEEK & THE PUNISHMENT
   ═══════════════════════════════════════════════════════════════════════════
   Copy lifted from the original rivalry.html, with the three things the old
   page could not do.

   The negotiation section is the one part of the old site whose concurrency
   model was already correct: each player writes only their own row and
   "agreed" is derived by comparing the pair. That is preserved exactly — and
   is now enforced by a primary key rather than by a comment.
   ═══════════════════════════════════════════════════════════════════════════ */

/* ── The ballot ──────────────────────────────────────────────────────────────
   Thirteen people wrote a punishment into the Pre-Season Intake. This is that
   list, edited: one idea per line, spelled out well enough to vote on, and
   de-duplicated by hand rather than by string comparison.

   Three of the edits are worth naming, because none of them could have been
   made by code:

     · Two people wrote the milk mile and two wrote the 24-hour diner. As raw
       text those are four options splitting their own vote four ways; as ideas
       they are two. `norm` would not have caught either pair — "Milk Mile" and
       "I want to see someone actually do a milk mile" share no normalised
       form.
     · One submission was three separate punishments in one box. It is three
       lines here, because a ranked ballot cannot express "the second of these
       three".
     · Several were shorthand between friends — "BWW challenge, no milk no
       water", "Regular Show Eggscellent Challenge". Spelled out, they are
       rules somebody could actually be held to in January.

   `importFrom` is deliberately NOT set on this question any more. Pointing it
   back at the intake would re-add all thirteen raw strings alongside these,
   and each near-duplicate would sit on the ballot competing with its own
   cleaned-up version. Nothing is closed off by that: write-ins are still open,
   so anything missing joins the pool the moment somebody adds it.

   These are commissioner options, so they render first, marked ★.
   ────────────────────────────────────────────────────────────────────────── */
const PUNISHMENTS = [
	'Run the Milk Mile',
	'24 straight hours inside an IHOP',
	'The Blazin’ Wing Challenge at B-Dubs',
	'The Eggscellent Challenge. Like from Regular Show',
	'Open and Close at the mall in a full mascot suit, have to get 10 photos with strangers',
	'Record a self-diss track about your own season and post it',
	'The laying-down MacBook photoshoot, posted to insta',
	'Go on an e-date. Though a discord dating server',
	'8 hours in a bowling alley, every strike is -15min every gutter ball is +15min',
	'Re-take the SAT, need a 1100 or better or you redo it',
	'Go door to door trying to get people to join your fake cult',
	'Trick or Treat in January',
	'Send a dick pic to the league, straight up.',
];

export const rivalry: SurveyDefinition = {
	id: 'rivalry',
	title: 'Rivalry Week & The Punishment',
	short: 'Rivalry Week',
	blurb: 'Rank the punishment and who serves it, then settle your rivalry in writing.',
	submitLabel: 'Save my answers',
	successStamp: 'ON THE\nRECORD',
	successNote: 'Your ballot is in. Your rivalry keeps updating. Come back any time.',

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
					feeds: [
						{ label: 'The Punishment — the sentence', href: '/b/punishment', deskTab: 'punishment' }
					],
					help:
						'Tap in order. First tap is your 1st choice, worth **3 points**, then 2, then 1. Missing yours? Write it in.',
					required: true,
					podiumSize: 3,
					// A half-filled podium is a quieter vote than a full one, and looks
					// identical to the person casting it. All three, or it does not count.
					minPicks: 3,
					points: [3, 2, 1],
					writeIn: {
						label: 'Not on the list? Add one',
						placeholder: 'Your own diabolical suggestion. It joins the ballot for everyone.',
						maxLength: 400
					},
					commissionerOptions: PUNISHMENTS
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
					feeds: [
						{ label: 'The Punishment — who does it', href: '/b/punishment', deskTab: 'punishment' }
					],
					help: 'The part everyone argues about in January. Settle it now.',
					required: true,
					layout: 'list',
					/* Two, and a way out. The old list had five, and three of them
					   were variations fine enough that the vote split between people
					   who wanted the same thing — "last place, final standings" and
					   "last place, regular season" are one argument, not two.

					   Both survivors are settled by Sleeper rather than by anybody's
					   memory in January: `resolveVictim` reads one off the standings
					   and the other off the losers bracket. */
					options: [
						{
							id: 'reg-last',
							label: 'Last place, regular season',
							sub: 'Worst record when the regular season ends. Playoffs be damned.'
						},
						{
							id: 'toilet',
							label: 'Last place, toilet bowl',
							sub: 'Whoever loses the consolation bracket'
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
				'Write your answer, or take your rival’s. A line settles when **you both have the same thing**. ' +
				'**Not settled by draft day and I pick for you**, so text each other.',
			questions: [
				{
					id: 'negotiation',
					type: 'negotiation',
					prompt: 'Settle it',
					required: false,
					feeds: [
						{ label: 'The Rivalry Board', href: '/b/rivalry', deskTab: 'rivalries' }
					],
					fields: [
						{
							key: 'rname',
							tag: 'RIVALRY NAME',
							short: 'Rivalry name',
							kind: 'name',
							prompt: 'What is this rivalry called?',
							help:
								'Goes on the Rivalry Board forever. Make it hurt. **You do not get to skip this one.**',
							placeholder: 'e.g. The Battle for the Last Brain Cell'
						},
						{
							key: 'bet',
							tag: 'THE SET BET',
							short: 'The bet',
							kind: 'money',
							prompt: 'How much is on your head-to-head?',
							help: 'Loser pays the winner. Nothing to do with the league pot.',
							placeholder: '20',
							optional: {
								decline: 'I don’t want a bet',
								none: 'No bet. Just pride.'
							}
						},
						{
							key: 'side',
							tag: 'SIDE FORFEIT',
							short: 'Side forfeit',
							kind: 'text',
							prompt: 'What else does the loser of your matchup owe?',
							help: 'Not money, and not the league punishment. Just between you two.',
							placeholder: "e.g. Loser runs the winner's team name for a week",
							optional: {
								decline: 'I don’t want a forfeit',
								none: 'No forfeit. The bet is the whole bet.'
							}
						},
						/* One card, two rows. Grouped because a secondary colour is
						   only judgeable against the primary sitting next to it. */
						{
							key: 'colorPrimary',
							group: 'colors',
							tag: 'TEAM COLORS',
							short: 'Primary',
							kind: 'color',
							mode: 'own',
							prompt: 'Your team colors',
							help:
								'Yours alone, and you should **not** match your rival. Skip near-black and near-white, they print as nothing.',
							placeholder: '#b91932'
						},
						{
							key: 'colorSecondary',
							group: 'colors',
							tag: 'TEAM COLORS',
							short: 'Secondary',
							kind: 'color',
							mode: 'own',
							prompt: 'Your secondary color',
							help: 'The trim, about a third of the pattern.',
							placeholder: '#d2a519'
						}
					]
				}
			]
		}
	]
};
