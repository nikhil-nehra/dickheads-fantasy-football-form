<script lang="ts">
	import type { AllocationQuestion } from '$lib/surveys/types';

	type Filled = { buckets: number[]; carveOut: number };
	type Value = { abstain: true } | Filled;

	let {
		question,
		value = $bindable(),
		amount = 0,
		potSize = 0,
		disabled = false
	}: {
		question: AllocationQuestion;
		value: Value | undefined;
		/** Per-person figure driving the live dollar preview. */
		amount?: number;
		potSize?: number;
		disabled?: boolean;
	} = $props();

	const ORDINALS = ['1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th'];

	let abstain = $derived(!!value && 'abstain' in value);
	let filled = $derived<Filled>(
		value && !('abstain' in value)
			? value
			: {
					buckets: question.templates[question.defaultBuckets] ?? [],
					carveOut: question.carveOut?.default ?? 0
				}
	);

	let total = $derived(filled.buckets.reduce((a, b) => a + b, 0) + filled.carveOut);
	let balanced = $derived(total === question.total);

	function commit(next: Filled) {
		value = next;
	}

	function setBucketCount(n: number) {
		const template = question.templates[n] ?? Array(n).fill(0);
		// Re-fund the carve-out out of the template so the total stays honest.
		const carve = filled.carveOut;
		const buckets = [...template];
		let owed = carve;
		while (owed > 0) {
			const largest = buckets.indexOf(Math.max(...buckets));
			if (buckets[largest] < question.step) break;
			buckets[largest] -= question.step;
			owed -= question.step;
		}
		commit({ buckets, carveOut: carve - owed });
	}

	function nudge(i: number, delta: number) {
		const buckets = [...filled.buckets];
		const next = buckets[i] + delta;
		if (next < 0) return;
		buckets[i] = next;
		commit({ ...filled, buckets });
	}

	function nudgeCarve(delta: number) {
		const next = filled.carveOut + delta;
		if (next < 0) return;
		commit({ ...filled, carveOut: next });
	}

	function money(pct: number): string {
		if (!potSize) return '';
		return `$${Math.round((potSize * pct) / 100).toLocaleString()}`;
	}
</script>

{#if question.allowAbstain}
	<label class="abstain">
		<input
			type="checkbox"
			{disabled}
			checked={abstain}
			onchange={(e) => (value = e.currentTarget.checked ? { abstain: true } : filled)}
		/>
		<span>{question.allowAbstain.label}</span>
	</label>
{/if}

{#if !abstain}
	<div class="builder" class:off={disabled}>
		<div class="places">
			<span id="places-label">How many places get paid?</span>
			<div class="row" role="group" aria-labelledby="places-label">
				{#each Array(question.maxBuckets - question.minBuckets + 1) as _, i}
					{@const n = question.minBuckets + i}
					<button
						type="button"
						class="chip"
						{disabled}
						aria-pressed={filled.buckets.length === n}
						onclick={() => setBucketCount(n)}
					>{n}</button>
				{/each}
			</div>
		</div>

		<ul class="cuts">
			{#each filled.buckets as pct, i (i)}
				<li>
					<span class="cut-name">{ORDINALS[i]} {question.bucketNoun}</span>
					<span class="cut-val">
						<strong>{pct}%</strong>
						{#if potSize}<span class="faint">{money(pct)}</span>{/if}
					</span>
					<span class="stepper">
						<button
							type="button"
							{disabled}
							aria-label="Decrease {ORDINALS[i]} {question.bucketNoun} by {question.step} percent"
							onclick={() => nudge(i, -question.step)}
						>−</button>
						<button
							type="button"
							{disabled}
							aria-label="Increase {ORDINALS[i]} {question.bucketNoun} by {question.step} percent"
							onclick={() => nudge(i, question.step)}
						>+</button>
					</span>
				</li>
			{/each}

			{#if question.carveOut}
				<li class="carve">
					<span class="cut-name">
						{question.carveOut.label}
						{#if question.carveOut.sub}<span class="faint">{question.carveOut.sub}</span>{/if}
					</span>
					<span class="cut-val">
						<strong>{filled.carveOut}%</strong>
						{#if potSize}<span class="faint">{money(filled.carveOut)}</span>{/if}
					</span>
					<span class="stepper">
						<button
							type="button"
							{disabled}
							aria-label="Decrease {question.carveOut.label} by {question.step} percent"
							onclick={() => nudgeCarve(-question.step)}
						>−</button>
						<button
							type="button"
							{disabled}
							aria-label="Increase {question.carveOut.label} by {question.step} percent"
							onclick={() => nudgeCarve(question.step)}
						>+</button>
					</span>
				</li>
			{/if}
		</ul>

		<!-- The meter is a hint, not the gate: the same 100% rule is re-checked
		     on the server, which the old browser-only version never was. -->
		<div class="total" class:ok={balanced}>
			<div class="meter" aria-hidden="true">
				<i style="width:{Math.min(100, (total / question.total) * 100)}%"></i>
			</div>
			<p role="status" aria-live="polite">
				{#if balanced}
					✓ Adds up to {question.total}%
				{:else if total > question.total}
					{total}% — that's {total - question.total}% too much
				{:else}
					{total}% — {question.total - total}% still to give away
				{/if}
			</p>
		</div>

		{#if amount}
			<p class="faint">
				Live dollars use your ${amount} buy-in — a ${potSize.toLocaleString()} pot.
			</p>
		{/if}
	</div>
{/if}

<style>
	.abstain {
		display: flex;
		align-items: center;
		gap: var(--s-2);
		font-weight: 600;
		margin-bottom: var(--s-3);
		cursor: pointer;
	}

	.abstain input {
		width: 20px;
		height: 20px;
	}

	.builder {
		display: flex;
		flex-direction: column;
		gap: var(--s-4);
	}

	.places span {
		display: block;
		font-weight: 700;
		font-size: var(--t-sm);
		margin-bottom: var(--s-2);
	}

	.cuts {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: var(--s-2);
	}

	.cuts li {
		display: flex;
		align-items: center;
		gap: var(--s-3);
		padding: var(--s-2) var(--s-3);
		border-radius: var(--r-md);
		background: var(--surface-2);
		border: 1px solid var(--border);
	}

	.carve {
		border-style: dashed;
	}

	.cut-name {
		flex: 1;
		font-weight: 700;
		display: flex;
		flex-direction: column;
	}

	.cut-name .faint {
		font-weight: 400;
	}

	.cut-val {
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		min-width: 68px;
		font-variant-numeric: tabular-nums;
	}

	.stepper {
		display: flex;
		gap: var(--s-1);
	}

	/* Both steppers are full touch targets — the originals were 34x34 and
	   30x30, below the comfortable minimum for the primary control. */
	.stepper button {
		width: var(--tap);
		height: var(--tap);
		border-radius: var(--r-sm);
		border: 1px solid var(--border-strong);
		background: var(--surface);
		font-size: var(--t-lg);
		font-weight: 800;
		cursor: pointer;
	}

	.stepper button:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}

	.total p {
		margin-top: var(--s-2);
		font-weight: 700;
		font-size: var(--t-sm);
		color: var(--danger);
	}

	.total.ok p {
		color: var(--ok);
	}

	.total.ok .meter > i {
		background: var(--ok);
	}
</style>
