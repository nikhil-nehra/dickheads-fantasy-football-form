<script lang="ts">
	import type { BallotQuestion } from '$lib/surveys/types';
	import type { BallotOption } from '$lib/components/types';

	let {
		question,
		value = $bindable([]),
		options = [],
		disabled = false,
		onwritein
	}: {
		question: BallotQuestion;
		value: string[];
		options?: BallotOption[];
		disabled?: boolean;
		/** Creates the option server-side and resolves to its stable id. */
		onwritein?: (text: string) => Promise<string | null>;
	} = $props();

	const MEDALS = ['🥇', '🥈', '🥉'];

	let writeIn = $state('');
	let saving = $state(false);
	let writeInError = $state('');

	let byId = $derived(new Map(options.map((o) => [o.id, o])));
	let podium = $derived(value.filter((id) => byId.has(id)));
	let pool = $derived(options.filter((o) => !podium.includes(o.id)));
	let full = $derived(podium.length >= question.podiumSize);

	function add(id: string) {
		if (full || podium.includes(id)) return;
		value = [...podium, id];
	}

	function remove(id: string) {
		value = podium.filter((p) => p !== id);
	}

	function moveUp(i: number) {
		if (i === 0) return;
		const next = [...podium];
		[next[i - 1], next[i]] = [next[i], next[i - 1]];
		value = next;
	}

	async function submitWriteIn() {
		const text = writeIn.trim();
		if (!text || !onwritein) return;
		saving = true;
		writeInError = '';
		try {
			const id = await onwritein(text);
			// A duplicate resolves to the EXISTING option's id rather than
			// creating a second row — de-duplication is a UNIQUE constraint on
			// normalised text, not a client-side pass over everyone's answers.
			if (id && !full && !podium.includes(id)) value = [...podium, id];
			writeIn = '';
		} catch {
			writeInError = "Couldn't add that one. Try again.";
		} finally {
			saving = false;
		}
	}
</script>

<div class="podium" role="list" aria-label="Your ranking">
	{#each podium as id, i (id)}
		{@const opt = byId.get(id)}
		<div class="slot" role="listitem">
			<span class="medal" aria-hidden="true">{MEDALS[i] ?? i + 1}</span>
			<span class="txt">
				<span class="sr-only">Rank {i + 1}, worth {question.points[i] ?? 0} points:</span>
				{opt?.text}
			</span>
			<button
				type="button"
				class="icon"
				{disabled}
				aria-label="Move {opt?.text} up"
				onclick={() => moveUp(i)}
				hidden={i === 0}>↑</button>
			<button
				type="button"
				class="icon"
				{disabled}
				aria-label="Remove {opt?.text} from your ranking"
				onclick={() => remove(id)}>✕</button>
		</div>
	{/each}

	{#each Array(Math.max(0, question.podiumSize - podium.length)) as _, i}
		<div class="slot empty" role="listitem">
			<span class="medal" aria-hidden="true">{MEDALS[podium.length + i] ?? ''}</span>
			<span class="txt faint">Pick your {['1st', '2nd', '3rd'][podium.length + i] ?? 'next'} choice</span>
		</div>
	{/each}
</div>

<ul class="pool">
	{#each pool as opt (opt.id)}
		<li>
			<button type="button" class="opt" disabled={disabled || full} onclick={() => add(opt.id)}>
				{#if opt.source === 'commissioner'}<span class="star" aria-label="Official shortlist">★</span>{/if}
				<span class="opt-text">{opt.text}</span>
				{#if opt.suggestedBy}<span class="faint by">— {opt.suggestedBy}</span>{/if}
			</button>
		</li>
	{/each}

	<!-- Both empty states used to point at the write-in box. A ballot with no
	     write-in has no box to point at, so they say what is actually true
	     instead of instructing you to do something impossible. -->
	{#if options.length === 0}
		<li class="muted">
			{question.writeIn
				? 'Nothing on the ballot yet. Write one in below and it joins the ballot for everyone.'
				: 'Nothing on the ballot yet.'}
		</li>
	{:else if pool.length === 0}
		<li class="muted">
			{question.writeIn
				? "That's the whole ballot so far. Write another one in below."
				: "That's the whole ballot."}
		</li>
	{/if}
</ul>

{#if question.writeIn && onwritein}
	<div class="write-in">
		<label for="writein-{question.id}">{question.writeIn.label}</label>
		<textarea
			id="writein-{question.id}"
			bind:value={writeIn}
			{disabled}
			rows="2"
			maxlength={question.writeIn.maxLength ?? 400}
			placeholder={question.writeIn.placeholder}
		></textarea>
		<button
			type="button"
			class="btn btn--ghost"
			disabled={disabled || saving || !writeIn.trim()}
			onclick={submitWriteIn}
		>
			{saving ? 'Adding…' : 'Add to the ballot'}
		</button>
		{#if writeInError}<p class="notice notice--danger">{writeInError}</p>{/if}
	</div>
{/if}

<style>
	.podium {
		display: flex;
		flex-direction: column;
		gap: var(--s-2);
		margin-bottom: var(--s-4);
	}

	.slot {
		display: flex;
		align-items: center;
		gap: var(--s-3);
		padding: var(--s-2) var(--s-3);
		border-radius: var(--r-md);
		border: 2px solid var(--gold);
		background: var(--surface-2);
		min-height: var(--tap);
	}

	.slot.empty {
		border-style: dashed;
		border-color: var(--border-strong);
	}

	.medal {
		font-size: var(--t-lg);
		width: 28px;
		text-align: center;
	}

	.txt {
		flex: 1;
		font-weight: 600;
	}

	/* Was a bare button at roughly 17x17 — the hardest thing on the page to hit. */
	.icon {
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

	.pool {
		list-style: none;
		margin: 0 0 var(--s-4);
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: var(--s-2);
	}

	.opt {
		display: flex;
		align-items: center;
		gap: var(--s-2);
		width: 100%;
		text-align: left;
		min-height: var(--tap);
		padding: var(--s-2) var(--s-3);
		border-radius: var(--r-md);
		border: 1px solid var(--border);
		background: var(--surface-2);
		cursor: pointer;
	}

	.opt:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.opt-text {
		flex: 1;
	}

	.star {
		color: var(--gold);
	}

	.by {
		white-space: nowrap;
	}

	@media (hover: hover) {
		.opt:not(:disabled):hover {
			border-color: var(--gold);
		}
	}

	.write-in {
		display: flex;
		flex-direction: column;
		gap: var(--s-2);
		align-items: flex-start;
	}
</style>
