<script lang="ts">
	import type { NegotiationField, SurveyDefinition } from '$lib/surveys/types';
	import { allQuestions } from '$lib/surveys/types';
	import Icon from '$lib/components/Icon.svelte';
	import { fieldStatus, isNone, ownValue, STATE_LABEL, type Entry } from '$lib/negotiation';
	import {
		singleTally,
		multiTally,
		rankTally,
		ballotTally,
		textQuotes,
		availabilityStats,
		bestSlot,
		allocationAverage,
		missing,
		type Submission
	} from '$lib/tally';

	type Pair = { id: string; a: string; b: string; aName: string; bName: string };
	type NegRow = { pairing_id: string; player_id: string; field_key: string; proposal: string | null; pick: string | null };
	type RuleRow = { pairing_id: string; field_key: string; value: string };

	let {
		def,
		submissions,
		roster,
		ballots = {},
		potSize = 0,
		pairings = [],
		negotiation = [],
		rulings = [],
		onFeedJump
	}: {
		def: SurveyDefinition;
		submissions: Submission[];
		roster: { id: string; display_name: string }[];
		ballots?: Record<string, { id: string; text: string }[]>;
		potSize?: number;
		/* The rivalry mechanic does not live in `response.answers` — it is
		   pairwise, so it lives in its own table and has to be handed in
		   separately. Without these three a negotiation question is the one
		   question on the site whose answers you cannot read on its own page. */
		pairings?: Pair[];
		negotiation?: NegRow[];
		rulings?: RuleRow[];
		/** Jump to the Desk tab that turns an answer into a decision. */
		onFeedJump?: (tab: string) => void;
	} = $props();

	// Every question gets a tally chosen by its TYPE, so a new question is
	// summarised automatically rather than needing a bespoke renderer.
	let questions = $derived(allQuestions(def));
	let notIn = $derived(missing(roster, submissions));
	let nameOf = $derived(new Map(roster.map((p) => [p.id, p.display_name])));

	function optionText(questionId: string): Map<string, string> {
		return new Map((ballots[questionId] ?? []).map((o) => [o.id, o.text]));
	}

	function money(p: number): string {
		return potSize ? `$${Math.round((potSize * p) / 100).toLocaleString()}` : '';
	}

	/** One person's ladder, in names rather than ids. */
	function ladder(questionId: string, s: Submission): string[] {
		const order = s.answers[questionId];
		if (!Array.isArray(order)) return [];
		return (order as string[]).map((id) => nameOf.get(id) ?? id);
	}

	function entriesFor(pairingId: string, playerId: string): Entry[] {
		return negotiation.filter((e) => e.pairing_id === pairingId && e.player_id === playerId);
	}

	function rulingsFor(pairingId: string) {
		return rulings.filter((r) => r.pairing_id === pairingId);
	}

	/** Where every pair has got to on one negotiated line. */
	function lineRows(f: NegotiationField) {
		return pairings.map((p) => {
			const st = fieldStatus(f.key, entriesFor(p.id, p.a), entriesFor(p.id, p.b), rulingsFor(p.id));
			return { pair: p, st };
		});
	}

	function settledCount(f: NegotiationField): number {
		return lineRows(f).filter((r) => r.st.state === 'agreed' || r.st.state === 'forced').length;
	}

	function sideAnswer(pick: string | null): string {
		if (!pick) return 'nothing yet';
		return isNone(pick) ? 'wants none' : pick;
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
	<section class="tally">
		<h3>{q.prompt}</h3>

		{#if q.feeds?.length}
			<!-- Half of what this league asks is asked to decide something else.
			     The numbers used to sit a tab away from the decision they were
			     for, with nothing on either end saying so. -->
			<p class="feeds">
				<span class="down-tag gold">Feeds</span>
				{#each q.feeds as f, i (f.label)}
					{#if i > 0}<span class="faint"> · </span>{/if}
					<span class="feed">
						{f.label}
						{#if f.href}<a href={f.href}>board</a>{/if}
						{#if f.deskTab && onFeedJump}
							<button type="button" class="linky" onclick={() => onFeedJump?.(f.deskTab!)}
								>set it</button
							>
						{/if}
					</span>
				{/each}
			</p>
		{/if}

		{#if q.type === 'single' || q.type === 'multi'}
			{@const rows = q.type === 'single' ? singleTally(q, submissions) : multiTally(q, submissions)}
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
			{#if q.type === 'multi' && rows.length}
				<p class="faint">Percentages are of the people who answered, not of the ticks cast.</p>
			{/if}
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
			<!-- A ladder used to be the one question type with no tally at all —
			     it said "this feeds the pairings" and showed nothing, which is
			     not a result. Borda points, because `excludeSelf` means people
			     rank lists of different lengths and a raw sum of positions
			     would punish whoever appeared on the longest ones. -->
			{@const rows = rankTally(q, submissions, nameOf)}
			{#if rows.length === 0}
				<p class="faint">Nobody has ranked anything yet.</p>
			{:else}
				<p class="faint">
					{q.topLabel ?? 'Top of the ladder'} first. Points are Borda — top of a list of n is worth
					n, the next n−1, and so on.
				</p>
				{#each rows as r, i (r.id)}
					<div class="bar">
						<span class="bar-label">
							{#if i === 0}<strong class="lead"><Icon name="trophy" size={15} /> {r.label}</strong
							>{:else}{r.label}{/if}
						</span>
						<div class="meter"><i style="width:{r.pct}%"></i></div>
						<span class="bar-n">{r.points} pts · avg {r.avg}</span>
					</div>
				{/each}

				<details class="raw">
					<summary>Every ladder, by player</summary>
					<ul class="ladders">
						{#each submissions as s (s.playerId)}
							{@const order = ladder(q.id, s)}
							{#if order.length}
								<li><strong>{s.playerName}:</strong> {order.join(' → ')}</li>
							{/if}
						{/each}
					</ul>
				</details>
			{/if}
		{:else if q.type === 'negotiation'}
			<!-- Pairwise, so it is not in `response.answers` and every other
			     tally is blind to it. It was skipped outright here, which made
			     the busiest question in the league the only one with no
			     results page. -->
			{#if pairings.length === 0}
				<p class="faint">No pairings set for this season, so there is nothing to settle yet.</p>
			{:else}
				{#each q.fields.filter((f) => f.mode !== 'own') as f (f.key)}
					{@const rows = lineRows(f)}
					{@const done = settledCount(f)}
					<div class="line">
						<div class="line-head">
							<span class="down-tag">{f.short}</span>
							<span class="faint nums">{done} of {rows.length} settled</span>
						</div>
						<div class="meter" aria-hidden="true">
							<i style="width:{rows.length ? (done / rows.length) * 100 : 0}%"></i>
						</div>
						<ul class="neg">
							{#each rows as { pair, st } (pair.id)}
								<li>
									<span class="neg-pair">{pair.aName} vs {pair.bName}</span>
									{#if st.value}
										<span class="settled" class:settled--none={isNone(st.value)}>
											{isNone(st.value) ? (f.optional?.none ?? "There isn't one.") : st.value}
										</span>
										<span class="faint">— {STATE_LABEL[st.state]}</span>
									{:else}
										<span class="faint">
											{STATE_LABEL[st.state]} · {pair.aName}: {sideAnswer(st.myPick)} · {pair.bName}:
											{sideAnswer(st.theirPick)}
										</span>
									{/if}
								</li>
							{/each}
						</ul>
					</div>
				{/each}

				{#each q.fields.filter((f) => f.mode === 'own') as f (f.key)}
					<div class="line">
						<div class="line-head">
							<span class="down-tag">{f.short}</span>
							<span class="faint">nothing to settle — each side answers for itself</span>
						</div>
						<ul class="neg">
							{#each pairings as p (p.id)}
								{#each [{ name: p.aName, id: p.a }, { name: p.bName, id: p.b }] as side (side.id)}
									{@const hex = ownValue(f.key, entriesFor(p.id, side.id))}
									<li>
										<span class="neg-pair">{side.name}</span>
										{#if hex}
											<span class="swatch" style="--c:{hex}"></span><span class="nums">{hex}</span>
										{:else}
											<span class="faint">not set</span>
										{/if}
									</li>
								{/each}
							{/each}
						</ul>
					</div>
				{/each}
			{/if}
		{/if}
	</section>
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

	/* Where the answer goes once it stops being an answer. Quiet enough to skip
	   when you only came for the numbers. */
	.feeds {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: var(--s-2);
		margin-bottom: var(--s-3);
		font-size: var(--t-sm);
		color: var(--ink-soft);
	}

	.feeds .down-tag {
		margin-bottom: 0;
	}

	.feed {
		display: inline-flex;
		align-items: baseline;
		gap: var(--s-2);
	}

	/* A button that has to read as a link, because it goes somewhere — it just
	   goes somewhere inside the page rather than at the end of an href. */
	.linky {
		border: 0;
		background: none;
		padding: 0;
		font: inherit;
		color: var(--accent-ink);
		text-decoration: underline;
		cursor: pointer;
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

	.raw {
		margin-top: var(--s-3);
		font-size: var(--t-sm);
	}

	.ladders {
		margin: var(--s-2) 0 0;
		padding-left: var(--s-4);
		display: flex;
		flex-direction: column;
		gap: var(--s-1);
	}

	/* ── The negotiated lines ──────────────────────────────────────────────── */

	.line {
		padding: var(--s-3);
		margin-bottom: var(--s-2);
		border-radius: var(--r-md);
		background: var(--surface-2);
		border: 1px solid var(--border);
	}

	.line-head {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: var(--s-2);
		margin-bottom: var(--s-2);
	}

	.line-head .down-tag {
		margin: 0;
	}

	.neg {
		list-style: none;
		margin: var(--s-3) 0 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: var(--s-2);
		font-size: var(--t-sm);
	}

	.neg li {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: var(--s-2);
	}

	.neg-pair {
		font-weight: 700;
		min-width: 12ch;
	}

	.settled {
		font-weight: 800;
	}

	/* Settled at nothing is still settled, but it is not a value and should not
	   be shouted like one. */
	.settled--none {
		font-weight: 600;
		font-style: italic;
		color: var(--ink-soft);
	}

	/* Named as well as shown — a bare square of colour does not survive being
	   glanced at. */
	.swatch {
		display: inline-block;
		width: 0.85em;
		height: 0.85em;
		vertical-align: -0.1em;
		margin-right: 0.2em;
		border-radius: 3px;
		border: 1px solid var(--border-strong);
		background: var(--c);
	}
</style>
