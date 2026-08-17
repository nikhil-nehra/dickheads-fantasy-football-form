<script lang="ts">
	import { flip } from 'svelte/animate';
	import type { Snippet } from 'svelte';
	import type { RankItem } from './types';

	let {
		items,
		order = $bindable(),
		heatmap = false,
		topLabel,
		bottomLabel,
		disabled = false,
		label = 'Ranking',
		detail
	}: {
		items: RankItem[];
		order: string[];
		heatmap?: boolean;
		topLabel?: string;
		bottomLabel?: string;
		disabled?: boolean;
		label?: string;
		/** Extra content rendered under a row — the availability day picker. */
		detail?: Snippet<[RankItem, number]>;
	} = $props();

	/* ═══════════════════════════════════════════════════════════════════════
	   Ordering by pointer AND by keyboard.

	   The old implementation bound `startDrag` to onpointerdown on a
	   non-focusable <div class="drag-handle">. There was no keydown listener
	   anywhere in the codebase, no arrow-key reordering and no live region —
	   and because ranking the weekends and ranking all 13 rivals were both
	   REQUIRED, Survey 1 simply could not be completed without a pointer.

	   Here the handle is a real <button>. Pointer drag still works exactly as
	   before; arrow keys now work too, and every move is announced.
	   ═══════════════════════════════════════════════════════════════════════ */

	let ordered = $derived(
		order.map((id) => items.find((i) => i.id === id)).filter((x): x is RankItem => !!x)
	);

	let announcement = $state('');
	let dragging = $state<string | null>(null);
	let listEl = $state<HTMLUListElement | null>(null);

	function move(id: string, to: number) {
		const from = order.indexOf(id);
		if (from < 0) return;
		const clamped = Math.max(0, Math.min(order.length - 1, to));
		if (clamped === from) return;

		const next = [...order];
		next.splice(from, 1);
		next.splice(clamped, 0, id);
		order = next;

		const item = items.find((i) => i.id === id);
		announcement = `${item?.label ?? id} moved to position ${clamped + 1} of ${order.length}.`;
	}

	function onKeydown(e: KeyboardEvent, id: string) {
		if (disabled) return;
		const i = order.indexOf(id);
		let to: number | null = null;

		if (e.key === 'ArrowUp') to = i - 1;
		else if (e.key === 'ArrowDown') to = i + 1;
		else if (e.key === 'Home') to = 0;
		else if (e.key === 'End') to = order.length - 1;
		else return;

		e.preventDefault();
		move(id, to);

		// Keep focus on the handle that just moved, so repeated presses walk
		// the item up or down the ladder.
		queueMicrotask(() => {
			listEl?.querySelector<HTMLButtonElement>(`[data-handle="${CSS.escape(id)}"]`)?.focus();
		});
	}

	function onPointerDown(e: PointerEvent, id: string) {
		if (disabled || e.button !== 0) return;
		e.preventDefault();
		dragging = id;
		(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
	}

	function onPointerMove(e: PointerEvent) {
		if (!dragging || !listEl) return;
		const rows = Array.from(listEl.querySelectorAll<HTMLLIElement>('li[data-id]'));
		// Drop where the pointer sits relative to each row's midpoint.
		const target = rows.findIndex((row) => {
			const r = row.getBoundingClientRect();
			return e.clientY < r.top + r.height / 2;
		});
		move(dragging, target === -1 ? rows.length - 1 : target);
	}

	function onPointerUp() {
		dragging = null;
	}

	function heat(i: number): string {
		if (!heatmap || ordered.length < 2) return '';
		const h = 1 - i / (ordered.length - 1);
		return `--heat-bg: hsl(${210 - h * 210} 60% ${94 - h * 8}%); --heat-bd: hsl(${210 - h * 210} 55% ${70 - h * 12}%)`;
	}
</script>

<div class="rank">
	{#if topLabel}<p class="edge">↑ {topLabel}</p>{/if}

	<ul bind:this={listEl} aria-label={label}>
		{#each ordered as item, i (item.id)}
			<li
				data-id={item.id}
				class:dragging={dragging === item.id}
				style={heat(i)}
				animate:flip={{ duration: 180 }}
			>
				<div class="head">
				<span class="pos" aria-hidden="true">{i + 1}</span>

				<span class="body">
					<span class="name">{item.label}</span>
					{#if item.sub}<span class="sub">{item.sub}</span>{/if}
				</span>

				<span class="controls">
					<button
						type="button"
						class="arrow"
						{disabled}
						aria-label="Move {item.label} up"
						onclick={() => move(item.id, i - 1)}
					>↑</button>
					<button
						type="button"
						class="arrow"
						{disabled}
						aria-label="Move {item.label} down"
						onclick={() => move(item.id, i + 1)}
					>↓</button>
					<button
						type="button"
						class="handle"
						data-handle={item.id}
						{disabled}
						aria-label="Reorder {item.label}. Position {i + 1} of {ordered.length}. Use arrow keys."
						onkeydown={(e) => onKeydown(e, item.id)}
						onpointerdown={(e) => onPointerDown(e, item.id)}
						onpointermove={onPointerMove}
						onpointerup={onPointerUp}
						onpointercancel={onPointerUp}
					>⠿</button>
				</span>
				</div>

				{#if detail}
					<div class="detail">{@render detail(item, i)}</div>
				{/if}
			</li>
		{/each}
	</ul>

	{#if bottomLabel}<p class="edge">↓ {bottomLabel}</p>{/if}

	<p class="sr-only" role="status" aria-live="polite">{announcement}</p>
</div>

<style>
	ul {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: var(--s-2);
	}

	li {
		padding: var(--s-2) var(--s-3);
		border-radius: var(--r-md);
		border: 2px solid var(--heat-bd, var(--border));
		background: var(--heat-bg, var(--surface-2));
		touch-action: none;
	}

	.head {
		display: flex;
		align-items: center;
		gap: var(--s-3);
	}

	.detail {
		padding: var(--s-2) 0 var(--s-1);
	}

	li.dragging {
		box-shadow: var(--shadow-sm);
		border-color: var(--gold);
	}

	.pos {
		flex: 0 0 auto;
		width: 24px;
		text-align: center;
		font-weight: 800;
		color: var(--ink-soft);
		font-variant-numeric: tabular-nums;
	}

	.body {
		flex: 1;
		display: flex;
		flex-direction: column;
		min-width: 0;
	}

	.name {
		font-weight: 700;
	}

	.sub {
		font-size: var(--t-sm);
		color: var(--ink-soft);
	}

	.controls {
		display: flex;
		align-items: center;
		gap: var(--s-1);
	}

	/* All three are full-size touch targets. The old drag handle was 34x42. */
	.arrow,
	.handle {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-width: var(--tap);
		min-height: var(--tap);
		border: 0;
		background: transparent;
		border-radius: var(--r-sm);
		font-size: var(--t-md);
		color: var(--ink-soft);
		cursor: pointer;
	}

	.handle {
		cursor: grab;
		touch-action: none;
	}

	.handle:active {
		cursor: grabbing;
	}

	.arrow:disabled,
	.handle:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}

	@media (hover: hover) {
		.arrow:hover:not(:disabled),
		.handle:hover:not(:disabled) {
			background: var(--surface-3);
			color: var(--ink);
		}
	}

	.edge {
		font-size: var(--t-xs);
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--ink-faint);
		margin: var(--s-1) 0;
	}

	/* On a narrow screen the arrows are the reliable control, so they stay. */
	@media (max-width: 420px) {
		.pos {
			width: 18px;
		}
	}
</style>
