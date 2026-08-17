<script lang="ts">
	import RankList from '$lib/components/RankList.svelte';
	import type { RankItem } from '$lib/components/types';
	import type { AvailabilityQuestion } from '$lib/surveys/types';

	type Value = { order: string[]; unavailable: string[]; mode: Record<string, string> };

	let {
		question,
		value = $bindable(),
		showMode = false,
		disabled = false
	}: {
		question: AvailabilityQuestion;
		value: Value | undefined;
		showMode?: boolean;
		disabled?: boolean;
	} = $props();

	let expanded = $state<string | null>(null);

	let windowIds = $derived(question.windows.map((w) => w.id));
	let items = $derived<RankItem[]>(question.windows.map((w) => ({ id: w.id, label: w.label })));

	// Seed and repair the value so `order` is always a permutation of windows.
	$effect(() => {
		const v = value ?? { order: [], unavailable: [], mode: {} };
		const kept = v.order.filter((id) => windowIds.includes(id));
		const added = windowIds.filter((id) => !kept.includes(id));
		if (added.length || kept.length !== v.order.length) {
			value = { ...v, order: [...kept, ...added] };
		}
	});

	let current = $derived<Value>(value ?? { order: windowIds, unavailable: [], mode: {} });

	function windowById(id: string) {
		return question.windows.find((w) => w.id === id)!;
	}

	function slotOff(slotId: string): boolean {
		return current.unavailable.includes(slotId);
	}

	function toggleSlot(slotId: string) {
		const off = slotOff(slotId);
		value = {
			...current,
			unavailable: off
				? current.unavailable.filter((s) => s !== slotId)
				: [...current.unavailable, slotId]
		};
	}

	function wholeWindowOff(windowId: string): boolean {
		return windowById(windowId).slots.every((s) => slotOff(s.id));
	}

	function toggleWholeWindow(windowId: string) {
		const slots = windowById(windowId).slots.map((s) => s.id);
		const allOff = wholeWindowOff(windowId);
		value = {
			...current,
			unavailable: allOff
				? current.unavailable.filter((s) => !slots.includes(s))
				: [...new Set([...current.unavailable, ...slots])]
		};
	}

	function setMode(windowId: string, modeId: string) {
		value = { ...current, mode: { ...current.mode, [windowId]: modeId } };
	}

	function summary(windowId: string): string {
		const w = windowById(windowId);
		const off = w.slots.filter((s) => slotOff(s.id)).length;
		if (off === 0) return 'All days work';
		if (off === w.slots.length) return "Can't make this weekend";
		return `${w.slots.length - off} of ${w.slots.length} days work`;
	}
</script>

<RankList
	{items}
	bind:order={() => current.order, (next) => (value = { ...current, order: next })}
	{disabled}
	label={question.prompt}
	topLabel="First choice"
	bottomLabel="Last choice"
	detail={dayPicker}
/>

{#snippet dayPicker(item: RankItem)}
	{@const w = windowById(item.id)}
	{@const off = wholeWindowOff(item.id)}

	<p class="summary" class:out={off}>{summary(item.id)}</p>

	<div class="row">
		<button
			type="button"
			class="linkish"
			{disabled}
			aria-expanded={expanded === item.id}
			aria-controls="days-{item.id}"
			onclick={() => (expanded = expanded === item.id ? null : item.id)}
		>
			{expanded === item.id ? 'Done ✓' : "📅 Can't make it?"}
		</button>

		<button type="button" class="linkish" {disabled} onclick={() => toggleWholeWindow(item.id)}>
			{off ? '↺ Actually I can make some' : "✕ Can't make any of this weekend"}
		</button>
	</div>

	{#if expanded === item.id}
		<fieldset id="days-{item.id}" {disabled} class="days">
			<legend class="faint">Tick the days you're out for {w.label}</legend>
			{#each w.slots as slot (slot.id)}
				<label class="day">
					<input type="checkbox" checked={slotOff(slot.id)} onchange={() => toggleSlot(slot.id)} />
					<span class="face">{slot.label}</span>
				</label>
			{/each}
		</fieldset>
	{/if}

	{#if showMode && question.mode && !off}
		<fieldset {disabled} class="modes">
			<legend class="faint">How would you be there for {w.label}?</legend>
			{#each question.mode.options as opt (opt.id)}
				<label class="day">
					<input
						type="radio"
						name="mode-{item.id}"
						checked={current.mode[item.id] === opt.id}
						onchange={() => setMode(item.id, opt.id)}
					/>
					<span class="face">{opt.label}</span>
				</label>
			{/each}
		</fieldset>
	{/if}
{/snippet}

<style>
	.summary {
		font-size: var(--t-sm);
		color: var(--ink-soft);
		margin-bottom: var(--s-1);
	}

	.summary.out {
		color: var(--danger);
		font-weight: 700;
	}

	.linkish {
		min-height: var(--tap);
		padding: 0 var(--s-2);
		border: 0;
		background: transparent;
		color: var(--accent-ink);
		font-size: var(--t-sm);
		font-weight: 700;
		text-decoration: underline;
		cursor: pointer;
	}

	.days,
	.modes {
		display: flex;
		flex-wrap: wrap;
		gap: var(--s-2);
		margin-top: var(--s-2);
	}

	.days legend,
	.modes legend {
		width: 100%;
		margin-bottom: var(--s-1);
	}

	.day {
		margin: 0;
		cursor: pointer;
	}

	.day input {
		position: absolute;
		opacity: 0;
		width: 1px;
		height: 1px;
	}

	.day .face {
		display: inline-flex;
		align-items: center;
		min-height: 36px;
		padding: 0 var(--s-3);
		border-radius: var(--r-pill);
		border: 1px solid var(--border-strong);
		background: var(--surface);
		font-size: var(--t-sm);
		font-weight: 600;
	}

	/* A ticked day chip means "I'm OUT", so it reads as a strike, not a select. */
	.days input:checked + .face {
		background: var(--danger-soft);
		border-color: var(--danger);
		color: var(--danger);
		text-decoration: line-through;
	}

	.modes input:checked + .face {
		background: var(--gold);
		border-color: var(--gold);
		color: #2a1e00;
	}

	.day input:focus-visible + .face {
		outline: 3px solid var(--gold-bright);
		outline-offset: 2px;
	}
</style>
