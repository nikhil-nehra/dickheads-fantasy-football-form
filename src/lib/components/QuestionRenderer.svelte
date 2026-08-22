<script lang="ts">
	import type { Question } from '$lib/surveys/types';
	import type { BallotOption } from '$lib/components/types';
	import RichText from './RichText.svelte';
	import QuestionSingle from './questions/QuestionSingle.svelte';
	import QuestionMulti from './questions/QuestionMulti.svelte';
	import QuestionText from './questions/QuestionText.svelte';
	import QuestionRank from './questions/QuestionRank.svelte';
	import QuestionAvailability from './questions/QuestionAvailability.svelte';
	import QuestionAllocation from './questions/QuestionAllocation.svelte';
	import QuestionBallot from './questions/QuestionBallot.svelte';

	/**
	 * One renderer for every survey. Nothing here switches on a survey id —
	 * only on a question TYPE — which is what makes adding a survey a
	 * single-file change.
	 */
	let {
		question,
		value = $bindable(),
		roster = [],
		playerId,
		ballotOptions = [],
		amount = 0,
		potSize = 0,
		showMode = false,
		disabled = false,
		error = '',
		onwritein
	}: {
		question: Question;
		/* This is the one place the answer value is untyped: it is the boundary
		   where a heterogeneous question union fans out to per-type components,
		   each of which types its own value precisely. */
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		value: any;
		roster?: { id: string; display_name: string }[];
		playerId?: string;
		ballotOptions?: BallotOption[];
		amount?: number;
		potSize?: number;
		showMode?: boolean;
		disabled?: boolean;
		error?: string;
		onwritein?: (text: string) => Promise<string | null>;
	} = $props();
</script>

<div class="q" class:has-error={!!error}>
	<p class="q-text">{question.prompt}</p>
	{#if question.help}
		<p class="q-help"><RichText text={question.help} /></p>
	{/if}

	{#if question.type === 'single'}
		<QuestionSingle {question} bind:value {disabled} />
	{:else if question.type === 'multi'}
		<QuestionMulti {question} bind:value {disabled} />
	{:else if question.type === 'text'}
		<QuestionText {question} bind:value {disabled} />
	{:else if question.type === 'rank'}
		<QuestionRank {question} bind:value {roster} {playerId} {disabled} />
	{:else if question.type === 'availability'}
		<QuestionAvailability {question} bind:value {showMode} {disabled} />
	{:else if question.type === 'allocation'}
		<QuestionAllocation {question} bind:value {amount} {potSize} {disabled} />
	{:else if question.type === 'ballot'}
		<QuestionBallot {question} bind:value options={ballotOptions} {disabled} {onwritein} />
	{/if}

	{#if error}
		<p class="notice notice--danger" role="alert">{error}</p>
	{/if}
</div>

<style>
	/* Sections carry a yard line; questions INSIDE a section carried nothing but
	   24px, and the draft-availability section has three of them in a row. Same
	   idea one weight down: a hairline, and enough air on both sides of it that
	   the rule reads as a boundary rather than as underlining for the thing
	   above it. */
	.q + :global(.q) {
		margin-top: var(--s-6);
		padding-top: var(--s-5);
		border-top: 1px dashed var(--border);
	}

	.has-error {
		border-left: 3px solid var(--danger);
		padding-left: var(--s-3);
		margin-left: calc(var(--s-3) * -1);
	}
</style>
