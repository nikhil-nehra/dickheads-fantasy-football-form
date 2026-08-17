<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import type { NegotiationQuestion } from '$lib/surveys/types';
	import { fieldStatus, type Entry, type Ruling } from '$lib/negotiation';

	type Negotiation = {
		pairingId: string;
		rival: { id: string; name: string } | null;
		mine: Entry[];
		theirs: Entry[];
		rulings: Ruling[];
	} | null;

	let {
		question,
		negotiation,
		surveyId,
		me,
		disabled = false
	}: {
		question: NegotiationQuestion;
		negotiation: Negotiation;
		surveyId: string;
		me: { id: string; display_name: string };
		disabled?: boolean;
	} = $props();

	// Local drafts, so typing is never clobbered by a background refresh —
	// the old page had to skip re-rendering whenever a text field had focus.
	let drafts = $state<Record<string, string>>({});
	let thirds = $state<Record<string, string>>({});
	let busy = $state<string | null>(null);
	let err = $state('');

	let rivalName = $derived(negotiation?.rival?.name ?? 'your rival');
	let firstName = $derived(rivalName.split(' ')[0]);

	function fieldOf(key: string) {
		return fieldStatus(key, negotiation?.mine ?? [], negotiation?.theirs ?? [], negotiation?.rulings ?? []);
	}

	function draft(key: string): string {
		return drafts[key] ?? fieldOf(key).myProposal ?? '';
	}

	async function save(fieldKey: string, proposal: string | null, pick: string | null) {
		if (!negotiation) return;
		busy = fieldKey;
		err = '';
		try {
			const res = await fetch(`/api/surveys/${surveyId}/negotiation`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					pairingId: negotiation.pairingId,
					playerId: me.id,
					fieldKey,
					proposal,
					pick
				})
			});
			if (!res.ok) {
				const body = (await res.json().catch(() => ({}))) as { message?: string };
				err = body.message ?? 'That did not save. Try again.';
				return;
			}
			delete drafts[fieldKey];
			await invalidateAll();
		} catch {
			err = "Couldn't reach the server.";
		} finally {
			busy = null;
		}
	}

	function lockIn(fieldKey: string, pick: string) {
		save(fieldKey, draft(fieldKey) || null, pick);
	}

	function reopen(fieldKey: string) {
		save(fieldKey, draft(fieldKey) || null, null);
	}
</script>

{#if !negotiation}
	<p class="notice">
		You haven't been paired up yet. The commissioner sets the rivalries — check back once
		they're posted.
	</p>
{:else}
	<div class="vs">
		<span>{me.display_name}</span>
		<span class="vs-mark">vs</span>
		<span>{rivalName}</span>
	</div>

	{#if err}<p class="notice notice--danger" role="alert">{err}</p>{/if}

	{#each question.fields as f (f.key)}
		{@const st = fieldOf(f.key)}
		<div class="neg" class:settled={st.state === 'agreed' || st.state === 'forced'}>
			<div class="neg-head">
				<span class="down-tag">{f.tag}</span>
				<span
					class="badge"
					class:badge--open={st.state === 'agreed'}
					class:badge--closed={st.state === 'waiting'}
					class:badge--draft={st.state === 'open'}
					class:badge--archived={st.state === 'forced'}
				>
					{#if st.state === 'agreed'}Agreed
					{:else if st.state === 'forced'}Ruled
					{:else if st.state === 'waiting'}In dispute
					{:else}Not set{/if}
				</span>
			</div>

			{#if st.state === 'agreed' || st.state === 'forced'}
				<p class="settled-value">{st.value}</p>
				{#if st.state === 'forced'}
					<p class="q-help">
						The commissioner ruled on this one. It stands unless they withdraw it.
					</p>
				{:else if !disabled}
					<button class="btn btn--ghost" disabled={busy === f.key} onclick={() => reopen(f.key)}>
						Reopen this line
					</button>
				{/if}
			{:else}
				<p class="q-text">{f.prompt}</p>
				<p class="q-help">{f.help}</p>

				<label for="prop-{f.key}">Your proposal</label>
				<textarea
					id="prop-{f.key}"
					rows="2"
					{disabled}
					placeholder={f.placeholder}
					value={draft(f.key)}
					oninput={(e) => (drafts[f.key] = e.currentTarget.value)}
				></textarea>

				<p class="rival-line">
					<strong>{firstName}'s proposal:</strong>
					{#if st.theirProposal}{st.theirProposal}{:else}<span class="faint">nothing yet</span>{/if}
				</p>

				{#if !disabled}
					<fieldset class="picks">
						<legend>Which are you backing?</legend>
						{#if draft(f.key).trim()}
							<button
								class="pick"
								disabled={busy === f.key}
								onclick={() => lockIn(f.key, draft(f.key).trim())}
							>Mine — “{draft(f.key).trim()}”</button>
						{/if}
						{#if st.theirProposal}
							<button
								class="pick"
								disabled={busy === f.key}
								onclick={() => lockIn(f.key, st.theirProposal!)}
							>{firstName}'s — “{st.theirProposal}”</button>
						{/if}
						<div class="third">
							<label for="third-{f.key}">A third option</label>
							<input
								id="third-{f.key}"
								type="text"
								placeholder="Type the compromise you both live with"
								bind:value={thirds[f.key]}
							/>
							<button
								class="pick"
								disabled={busy === f.key || !thirds[f.key]?.trim()}
								onclick={() => lockIn(f.key, thirds[f.key].trim())}
							>Lock in my pick</button>
						</div>
					</fieldset>
				{/if}

				<!-- Exactly where the two of you stand, which was the best copy on
				     the old page and is kept verbatim. -->
				<p class="neg-foot">
					{#if st.myPick && st.theirPick}
						You're backing <strong>“{st.myPick}”</strong> — {firstName} is backing
						<strong>“{st.theirPick}”</strong>. One of you has to blink. It locks the moment you
						match.
					{:else if st.myPick}
						You're backing <strong>“{st.myPick}”</strong>. Waiting on {firstName}.
					{:else if st.theirPick}
						{firstName} is backing <strong>“{st.theirPick}”</strong>. Your move.
					{:else}
						Nobody has picked yet. Propose something.
					{/if}
				</p>
			{/if}
		</div>
	{/each}
{/if}

<style>
	.vs {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: var(--s-3);
		padding: var(--s-3);
		margin-bottom: var(--s-4);
		border-radius: var(--r-md);
		background: var(--field-2);
		color: var(--chalk);
		font-weight: 800;
		text-align: center;
	}

	.vs-mark {
		color: var(--gold);
		font-family: var(--font-display);
		font-style: italic;
	}

	.neg {
		padding: var(--s-4);
		border: 1px solid var(--border);
		border-radius: var(--r-md);
		background: var(--surface-2);
		margin-bottom: var(--s-3);
	}

	.neg.settled {
		border-color: var(--ok);
		background: var(--ok-soft);
	}

	.neg-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--s-2);
		margin-bottom: var(--s-2);
	}

	.neg-head .down-tag {
		margin: 0;
	}

	.settled-value {
		font-size: var(--t-md);
		font-weight: 800;
		margin-bottom: var(--s-2);
	}

	.rival-line {
		margin: var(--s-3) 0;
		font-size: var(--t-sm);
	}

	.picks {
		display: flex;
		flex-direction: column;
		gap: var(--s-2);
	}

	.picks legend {
		font-weight: 700;
		font-size: var(--t-sm);
		margin-bottom: var(--s-2);
	}

	.pick {
		min-height: var(--tap);
		padding: var(--s-2) var(--s-3);
		text-align: left;
		border-radius: var(--r-md);
		border: 2px solid var(--border-strong);
		background: var(--surface);
		font-weight: 600;
		cursor: pointer;
	}

	.pick:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	@media (hover: hover) {
		.pick:not(:disabled):hover {
			border-color: var(--gold);
		}
	}

	.third {
		display: flex;
		flex-direction: column;
		gap: var(--s-2);
		padding: var(--s-3);
		border-radius: var(--r-md);
		border: 1px dashed var(--border-strong);
	}

	.neg-foot {
		margin-top: var(--s-3);
		font-size: var(--t-sm);
		color: var(--ink-soft);
	}
</style>
