<script lang="ts">
	import type { MultiQuestion } from '$lib/surveys/types';

	type Value = { choices: string[]; other?: string };

	let {
		question,
		value = $bindable(),
		disabled = false
	}: { question: MultiQuestion; value: Value | undefined; disabled?: boolean } = $props();

	let chosen = $derived(value?.choices ?? []);

	function toggle(id: string) {
		const next = chosen.includes(id) ? chosen.filter((c) => c !== id) : [...chosen, id];
		value = { ...(value ?? { choices: [] }), choices: next };
	}
</script>

<fieldset {disabled}>
	<legend class="sr-only">{question.prompt}</legend>
	<div class={question.layout === 'list' ? 'list' : 'chips'}>
		{#each question.options as opt (opt.id)}
			<label class={question.layout === 'list' ? 'row-label' : 'chip-label'}>
				<input
					type="checkbox"
					checked={chosen.includes(opt.id)}
					onchange={() => toggle(opt.id)}
				/>
				<span class="face">
					<span class="label">{opt.label}</span>
					{#if opt.sub}<span class="sub">{opt.sub}</span>{/if}
				</span>
			</label>
		{/each}
	</div>
</fieldset>

<style>
	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: var(--s-2);
	}

	.list {
		display: flex;
		flex-direction: column;
		gap: var(--s-2);
	}

	input {
		position: absolute;
		opacity: 0;
		width: 1px;
		height: 1px;
	}

	.chip-label,
	.row-label {
		margin: 0;
		cursor: pointer;
	}

	.chip-label .face {
		display: inline-flex;
		align-items: center;
		min-height: var(--tap);
		padding: 0 var(--s-4);
		border-radius: var(--r-pill);
		border: 2px solid var(--border-strong);
		background: var(--surface-2);
		font-weight: 700;
	}

	.row-label .face {
		display: flex;
		flex-direction: column;
		gap: 2px;
		min-height: var(--tap);
		padding: var(--s-3) var(--s-4);
		border-radius: var(--r-md);
		border: 2px solid var(--border);
		background: var(--surface-2);
	}

	.sub {
		font-size: var(--t-sm);
		color: var(--ink-soft);
		font-weight: 400;
	}

	input:checked + .face {
		border-color: var(--gold);
		background: var(--gold);
		color: #2a1e00;
	}

	input:focus-visible + .face {
		outline: 3px solid var(--gold-bright);
		outline-offset: 2px;
	}
</style>
