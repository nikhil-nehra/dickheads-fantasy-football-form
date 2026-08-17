<script lang="ts">
	import type { TextQuestion } from '$lib/surveys/types';

	let {
		question,
		value = $bindable(),
		disabled = false
	}: { question: TextQuestion; value: string | undefined; disabled?: boolean } = $props();

	let id = $derived(`q-${question.id}`);
	let used = $derived((value ?? '').length);
	let max = $derived(question.maxLength ?? 2000);
</script>

<!-- Every control gets a real label. The old form had exactly one <label> in
     the entire site, so the name picker, the punishment box, every write-in
     and every negotiation field were unlabelled to a screen reader. -->
<label class="sr-only" for={id}>{question.prompt}</label>

{#if (question.lines ?? 1) > 1}
	<textarea
		{id}
		{disabled}
		rows={question.lines}
		maxlength={max}
		placeholder={question.placeholder}
		bind:value
	></textarea>
{:else}
	<input {id} {disabled} type="text" maxlength={max} placeholder={question.placeholder} bind:value />
{/if}

{#if used > max * 0.8}
	<p class="faint count" aria-live="polite">{used} / {max}</p>
{/if}

<style>
	.count {
		text-align: right;
		margin-top: var(--s-1);
	}
</style>
