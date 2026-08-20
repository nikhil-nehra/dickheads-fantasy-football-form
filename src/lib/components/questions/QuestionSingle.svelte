<script lang="ts">
	import type { SingleQuestion } from '$lib/surveys/types';
	import Icon from '$lib/components/Icon.svelte';

	type Value = { choice?: string; other?: string };

	let {
		question,
		value = $bindable(),
		disabled = false
	}: { question: SingleQuestion; value: Value | undefined; disabled?: boolean } = $props();

	// Real <input type="radio"> in a <fieldset>, not styled <div onclick>.
	// The old site used divs with click handlers and a ::after pseudo-element
	// for the dot: no role, no focus, no arrow-key navigation, and a screen
	// reader heard an unlabelled list. Native radios give all of that free.
	let name = $derived(`q-${question.id}`);

	function pick(id: string) {
		value = { ...(value ?? {}), choice: id };
	}
</script>

<fieldset {disabled}>
	<legend class="sr-only">{question.prompt}</legend>
	<div class={question.layout === 'chips' ? 'chips' : 'list'}>
		{#each question.options as opt (opt.id)}
			<label class={question.layout === 'chips' ? 'chip-label' : 'row-label'}>
				<input
					type="radio"
					{name}
					value={opt.id}
					checked={value?.choice === opt.id}
					onchange={() => pick(opt.id)}
				/>
				<span class="face">
					<!-- Decorative: the label right beside it says the same thing. -->
					{#if opt.icon}<Icon name={opt.icon} size={18} />{/if}
					<span class="label">{opt.label}</span>
					{#if opt.sub}<span class="sub">{opt.sub}</span>{/if}
				</span>
			</label>
		{/each}

		{#if question.writeIn}
			<label class={question.layout === 'chips' ? 'chip-label' : 'row-label'}>
				<input
					type="radio"
					{name}
					value="__other"
					checked={value?.choice === '__other'}
					onchange={() => pick('__other')}
				/>
				<span class="face">
					<span class="label">{question.writeIn.label}</span>
					{#if value?.choice !== '__other'}
						<span class="sub">You explain it, you defend it.</span>
					{/if}
				</span>
			</label>
		{/if}
	</div>

	{#if question.writeIn && value?.choice === '__other'}
		<div class="write-in">
			<label for="{name}-other">{question.writeIn.label}</label>
			<input
				id="{name}-other"
				type="text"
				placeholder={question.writeIn.placeholder}
				maxlength={question.writeIn.maxLength ?? 200}
				value={value?.other ?? ''}
				oninput={(e) => (value = { ...(value ?? {}), other: e.currentTarget.value })}
			/>
		</div>
	{/if}
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

	/* The radio itself stays in the accessibility tree and keeps focus; it is
	   only visually replaced by the styled face next to it. */
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
		justify-content: center;
		gap: var(--s-2);
		min-height: var(--tap);
		padding: 0 var(--s-4);
		border-radius: var(--r-pill);
		border: 2px solid var(--border-strong);
		background: var(--surface-2);
		font-weight: 700;
		transition: border-color 0.12s ease, background 0.12s ease, transform 0.12s ease;
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

	.row-label .label {
		font-weight: 700;
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

	input:checked + .face .sub {
		color: #5a4200;
	}

	/* Focus lands on the invisible input, so the ring has to be drawn here. */
	input:focus-visible + .face {
		outline: 3px solid var(--gold-bright);
		outline-offset: 2px;
	}

	@media (hover: hover) {
		label:hover .face {
			border-color: var(--gold);
		}
	}

	fieldset:disabled .face {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.write-in {
		margin-top: var(--s-3);
	}
</style>
