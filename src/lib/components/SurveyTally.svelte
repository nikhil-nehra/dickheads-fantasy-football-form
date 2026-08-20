<script lang="ts">
	import type { SurveyDefinition } from '$lib/surveys/types';
	import { allQuestions } from '$lib/surveys/types';
	import Icon from '$lib/components/Icon.svelte';
	import {
		singleTally,
		ballotTally,
		textQuotes,
		availabilityStats,
		bestSlot,
		allocationAverage,
		missing,
		type Submission
	} from '$lib/tally';

	let {
		def,
		submissions,
		roster,
		ballots = {},
		potSize = 0
	}: {
		def: SurveyDefinition;
		submissions: Submission[];
		roster: { id: string; display_name: string }[];
		ballots?: Record<string, { id: string; text: string }[]>;
		potSize?: number;
	} = $props();

	// Every question gets a tally chosen by its TYPE, so a new question is
	// summarised automatically rather than needing a bespoke renderer.
	let questions = $derived(allQuestions(def));
	let notIn = $derived(missing(roster, submissions));

	function optionText(questionId: string): Map<string, string> {
		return new Map((ballots[questionId] ?? []).map((o) => [o.id, o.text]));
	}

	function money(p: number): string {
		return potSize ? `$${Math.round((potSize * p) / 100).toLocaleString()}` : '';
	}
</script>

<div class="turnout">
	<div class="meter" aria-hidden="true">
		<i style="width:{roster.length ? (submissions.length / roster.length) * 100 : 0}%"></i>
	</div>
	<p><strong>{submissions.length}</strong> of {roster.length} in</p>
	{#if notIn.length}
		<p class="faint">Still waiting on: {notIn.join(', ')}</p>
	{/if}
</div>

{#each questions as q (q.id)}
	{#if q.type !== 'negotiation'}
		<section class="tally">
			<h3>{q.prompt}</h3>

			{#if q.type === 'single' || q.type === 'multi'}
				{@const rows = q.type === 'single' ? singleTally(q, submissions) : []}
				{#if rows.length === 0}
					<p class="faint">No votes yet.</p>
				{/if}
				{#each rows as r (r.id)}
					<div class="bar">
						<span class="bar-label">{r.label}</span>
						<div class="meter"><i style="width:{r.pct}%"></i></div>
						<span class="bar-n">{r.n} · {r.pct}%</span>
					</div>
				{/each}
			{:else if q.type === 'ballot'}
				{@const rows = ballotTally(q, submissions, optionText(q.id))}
				{#if rows.length === 0}
					<p class="faint">Nobody has ranked anything yet.</p>
				{/if}
				{#each rows as r, i (r.id)}
					<div class="bar">
						<span class="bar-label">
							{#if i === 0}<strong class="lead"><Icon name="trophy" size={15} /> {r.label}</strong
							>{:else}{r.label}{/if}
						</span>
						<div class="meter"><i style="width:{r.pct}%"></i></div>
						<span class="bar-n">{r.points} pts · {r.firsts} firsts</span>
					</div>
				{/each}
			{:else if q.type === 'text'}
				{@const quotes = textQuotes(q, submissions)}
				{#if quotes.length === 0}
					<p class="faint">Nothing written in yet.</p>
				{/if}
				<ul class="quotes">
					{#each quotes as quote}
						<li><q>{quote.text}</q> <span class="faint">— {quote.by}</span></li>
					{/each}
				</ul>
			{:else if q.type === 'availability'}
				{@const stats = availabilityStats(q, submissions)}
				{@const best = bestSlot(q, submissions)}
				{#if best}
					<p class="headline">
						Best single date: <strong>{best.label}</strong> — {best.available} of {submissions.length}
						can make it
					</p>
				{/if}
				{#each stats as w (w.id)}
					<div class="window">
						<div class="window-head">
							<strong>{w.label}</strong>
							<span class="faint">{w.fullyAvailable} fully free</span>
						</div>
						<div class="slots">
							{#each w.slots as s (s.id)}
								<span class="slot" class:thin={s.available < submissions.length}>
									{s.label}: {s.available}
									{#if s.out.length}<span class="faint"> (out: {s.out.join(', ')})</span>{/if}
								</span>
							{/each}
						</div>
						{#if w.inPerson.length || w.virtual.length}
							<p class="faint">
								{#if w.inPerson.length}In person: {w.inPerson.join(', ')}.{/if}
								{#if w.virtual.length}Virtual: {w.virtual.join(', ')}.{/if}
							</p>
						{/if}
					</div>
				{/each}
			{:else if q.type === 'allocation'}
				{@const avg = allocationAverage(q, submissions)}
				{#if avg.respondents === 0}
					<p class="faint">Nobody has given a preference yet.</p>
				{:else}
					<p class="faint">
						Averaged over {avg.respondents}
						{avg.respondents === 1 ? 'person' : 'people'}{avg.abstained
							? `, ${avg.abstained} had no preference`
							: ''}.
					</p>
					{#each avg.buckets as b}
						<div class="bar">
							<span class="bar-label">{b.label}</span>
							<div class="meter"><i style="width:{b.pct}%"></i></div>
							<span class="bar-n">{b.pct}% {money(b.pct)}</span>
						</div>
					{/each}
					{#if avg.carveOut}
						<div class="bar">
							<span class="bar-label">{avg.carveOut.label}</span>
							<div class="meter"><i style="width:{avg.carveOut.pct}%"></i></div>
							<span class="bar-n">{avg.carveOut.pct}% {money(avg.carveOut.pct)}</span>
						</div>
					{/if}
				{/if}
			{:else if q.type === 'rank'}
				<p class="faint">
					Rankings feed the rivalry pairing suggestions rather than a standalone tally.
				</p>
			{/if}
		</section>
	{/if}
{/each}

<style>
	.lead {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		color: var(--accent-ink);
	}

	.turnout {
		margin-bottom: var(--s-5);
	}

	.turnout p {
		margin-top: var(--s-2);
	}

	.tally {
		padding-top: var(--s-4);
		margin-top: var(--s-4);
		border-top: 1px solid var(--border);
	}

	h3 {
		font-size: var(--t-base);
		margin-bottom: var(--s-3);
	}

	/* Bounded label column, then the meter takes the slack. */
	.bar {
		display: grid;
		grid-template-columns: minmax(120px, 300px) minmax(0, 1fr) auto;
		align-items: center;
		gap: var(--s-3);
		margin-bottom: var(--s-2);
		font-size: var(--t-sm);
	}

	.bar-label {
		min-width: 0;
		overflow-wrap: anywhere;
	}

	.bar-n {
		white-space: nowrap;
		font-variant-numeric: tabular-nums;
		color: var(--ink-soft);
	}

	@media (max-width: 520px) {
		.bar {
			grid-template-columns: minmax(0, 1fr) auto;
		}

		.bar .meter {
			grid-column: 1 / -1;
		}
	}

	.quotes {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: var(--s-2);
	}

	.quotes li {
		padding: var(--s-2) var(--s-3);
		border-left: 3px solid var(--gold);
		background: var(--surface-2);
		border-radius: 0 var(--r-sm) var(--r-sm) 0;
		font-size: var(--t-sm);
	}

	.headline {
		font-size: var(--t-md);
		margin-bottom: var(--s-3);
	}

	.window {
		padding: var(--s-3) 0;
		border-bottom: 1px solid var(--border);
	}

	.window-head {
		display: flex;
		justify-content: space-between;
		gap: var(--s-2);
	}

	.slots {
		display: flex;
		flex-wrap: wrap;
		gap: var(--s-2);
		margin-top: var(--s-2);
	}

	.slot {
		font-size: var(--t-xs);
		padding: 3px var(--s-2);
		border-radius: var(--r-pill);
		background: var(--ok-soft);
		color: var(--ok);
	}

	.slot.thin {
		background: var(--surface-3);
		color: var(--ink-soft);
	}
</style>
