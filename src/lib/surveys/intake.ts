import type { SurveyDefinition } from './types';

/* ═══════════════════════════════════════════════════════════════════════════
   SURVEY 1 — PRE-SEASON INTAKE
   ═══════════════════════════════════════════════════════════════════════════
   Copy is lifted verbatim from the original index.html. It is the best thing
   in the old codebase and none of it should be rewritten by accident.
   `**bold**` is the only markup `help` supports, and it is rendered by
   splitting the string — never by injecting HTML.
   ═══════════════════════════════════════════════════════════════════════════ */

export const intake: SurveyDefinition = {
	id: 'intake',
	title: 'Pre-Season Intake',
	short: 'Intake',
	blurb:
		'Buy-in, punishment ideas, draft availability, rivalry rankings and the prize split.',
	// The padlock is now an icon inside the button, not an emoji in the string.
	submitLabel: 'Lock It In',
	successStamp: 'OFFICIALLY\nENTERED',
	successNote: 'Your answers are on record. The commissioner sees all.',

	sections: [
		{
			id: 'buyin',
			tag: '1ST DOWN',
			title: 'The buy-in',
			questions: [
				{
					id: 'buyIn',
					type: 'single',
					prompt: "How much should the buy-in be?",
					required: true,
					layout: 'chips',
					feeds: [{ label: 'The Pot — the buy-in', href: '/b/pot', deskTab: 'pot' }],
					// Ids are the dollar amounts so `amountFrom` can read them directly.
					options: [
						{ id: '25', label: '$25' },
						{ id: '50', label: '$50' },
						{ id: '100', label: '$100' }
					]
				}
			]
		},

		{
			id: 'punishment',
			tag: '2ND DOWN',
			title: 'The punishment',
			questions: [
				{
					id: 'punishment',
					type: 'text',
					prompt: 'Write down at least one possible last-place punishment',
					help: "We'll vote on the winner later. Please be creative and diabolical.",
					required: true,
					lines: 3,
					maxLength: 400,
					placeholder: 'e.g. loser has to send a dick pic to their mother'
				}
			]
		},

		{
			id: 'draft',
			tag: '3RD DOWN',
			title: 'Draft availability',
			questions: [
				{
					id: 'locality',
					type: 'single',
					prompt: 'When are you available for the draft?',
					help: "First, tell us where you're coming from — in town (Dallas) or out of town.",
					required: true,
					layout: 'chips',
					// Icons rather than the emoji these labels used to carry: 📍 and
					// ✈️ rendered as a different picture per platform and could not
					// take the selected-chip colour.
					options: [
						{ id: 'local', label: 'In town (Dallas)', icon: 'home' },
						{ id: 'oot', label: 'Out of town', icon: 'away' }
					]
				},
				{
					id: 'availability',
					type: 'availability',
					prompt: 'Rank the weekends',
					help:
						'Drag the weekends by the ⠿ handle to rank them (top = your first choice), or use the arrow buttons. ' +
						'Can\'t do a whole weekend, or just certain days of it? Hit **"Can\'t make it?"** on that weekend to pick the exact dates you\'re out.',
					required: true,
					// The grid only appears once we know where you're coming from.
					showIf: { question: 'locality', answered: true },
					windows: WEEKENDS(),
					// …and the attendance chips only for out-of-towners.
					mode: {
						prompt:
							"It'd be pretty cool if you came down for a weekend — for each one you can do, mark whether you'd be there in person or joining virtually.",
						showIf: { question: 'locality', equals: 'oot' },
						options: [
							{ id: 'in-person', label: 'In person' },
							{ id: 'virtual', label: 'Virtual' }
						]
					}
				}
			]
		},

		{
			id: 'rivalry',
			tag: '4TH DOWN',
			title: 'Rivalry Selection',
			questions: [
				{
					id: 'beef',
					type: 'rank',
					prompt: 'Rivalry Selection',
					feeds: [{ label: 'Rivalry pairings — the suggested draw', deskTab: 'rivalries' }],
					help:
						'This is for **rivalry week** (the last week of the season) — there may even be a mini group punishment or payout for the losing side of each rivalry. ' +
						'Who do you have the most beef with, or want to beat the most? Drag by the ⠿ handle to rank.',
					required: true,
					source: { kind: 'roster', excludeSelf: true },
					topLabel: 'Most beef',
					bottomLabel: 'Least beef',
					heatmap: true
				}
			]
		},

		{
			id: 'prize',
			tag: 'OVERTIME · OPTIONAL',
			title: 'The prize pool',
			questions: [
				{
					id: 'prizeSplit',
					type: 'allocation',
					prompt: 'How should the prize pool be split?',
					feeds: [{ label: 'The Pot — the payout split', href: '/b/pot', deskTab: 'pot' }],
					help:
						'Set how many places get paid and dial in each cut (5% steps) — you can also give the regular-season points leader a slice.',
					required: false,
					total: 100,
					step: 5,
					minBuckets: 1,
					maxBuckets: 6,
					defaultBuckets: 3,
					bucketNoun: 'place',
					templates: {
						1: [100],
						2: [65, 35],
						3: [60, 30, 10],
						4: [50, 25, 15, 10],
						5: [45, 25, 15, 10, 5],
						6: [40, 25, 15, 10, 5, 5]
					},
					carveOut: {
						id: 'regSeason',
						label: 'Regular-season points leader',
						sub: 'A slice off the top for whoever scores the most in the regular season',
						default: 10
					},
					amountFrom: 'buyIn',
					allowAbstain: { label: 'No preference — let the commissioner decide' }
				}
			]
		}
	]
};

/**
 * The draft weekends. Dates are 2026 and deliberately live in the definition
 * rather than the database — they change once a year, with a commit.
 */
function WEEKENDS() {
	return [
		{
			id: 'w1',
			label: 'Aug 21–23',
			slots: [
				{ id: 'w1fri', label: 'Fri Aug 21' },
				{ id: 'w1sat', label: 'Sat Aug 22' },
				{ id: 'w1sun', label: 'Sun Aug 23' }
			]
		},
		{
			id: 'w2',
			label: 'Aug 28–30',
			slots: [
				{ id: 'w2fri', label: 'Fri Aug 28' },
				{ id: 'w2sat', label: 'Sat Aug 29' },
				{ id: 'w2sun', label: 'Sun Aug 30' }
			]
		},
		{
			id: 'w3',
			label: 'Sep 4–7',
			slots: [
				{ id: 'w3fri', label: 'Fri Sep 4' },
				{ id: 'w3sat', label: 'Sat Sep 5' },
				{ id: 'w3sun', label: 'Sun Sep 6' },
				{ id: 'w3mon', label: 'Mon Sep 7 · Labor Day' }
			]
		}
	];
}
