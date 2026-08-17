<script lang="ts">
	import { untrack } from 'svelte';
	import { invalidateAll } from '$app/navigation';
	import QuestionRenderer from './QuestionRenderer.svelte';
	import RichText from './RichText.svelte';
	import NegotiationSection from './NegotiationSection.svelte';
	import { isVisible, type Question, type SurveyDefinition } from '$lib/surveys/types';
	import { validateResponse } from '$lib/surveys/validate';
	import type { BallotOption } from './types';

	let {
		def,
		me,
		players,
		initialAnswers,
		ballots,
		negotiation,
		hasSaved,
		savedAt,
		canEdit
	}: {
		def: SurveyDefinition;
		me: { id: string; display_name: string };
		players: { id: string; display_name: string }[];
		initialAnswers: Record<string, unknown>;
		ballots: Record<string, BallotOption[]>;
		negotiation: never | null | Record<string, unknown>;
		hasSaved: boolean;
		savedAt: string | null;
		canEdit: boolean;
	} = $props();

	/* The whole form is keyed on the respondent by its parent, so this
	   component remounts when you switch names. That means the initial state
	   can just be read from props — it works during SSR, unlike a client
	   effect, so the first paint already shows your full ranking ladder. */
	let answers = $state<Record<string, unknown>>(untrack(() => ({ ...initialAnswers })));

	let submitting = $state(false);
	let confirmOverwrite = $state(false);
	let submitError = $state('');
	let fieldErrors = $state<Record<string, string>>({});
	let done = $state(false);

	/* The SAME validator the server runs, imported directly. The old site had
	   `formIssue()` in the browser and no validation at all on the server, so
	   the two could not agree — here they cannot disagree. */
	let check = $derived(
		validateResponse(def, answers, {
			playerId: me.id,
			rosterIds: players.map((p) => p.id),
			ballotOptions: Object.fromEntries(
				Object.entries(ballots).map(([q, opts]) => [q, opts.map((o) => o.id)])
			)
		})
	);

	let valid = $derived(check.ok);
	let firstIssue = $derived(check.ok ? null : check.errors[0]);

	function labelFor(questionId: string): string {
		for (const s of def.sections) {
			for (const q of s.questions) if (q.id === questionId) return q.prompt;
		}
		return 'Something';
	}

	function visible(q: Question): boolean {
		return isVisible(q, answers);
	}

	let buyIn = $derived(Number((answers.buyIn as { choice?: string })?.choice ?? 0) || 0);
	let potSize = $derived(buyIn * players.length);
	let showMode = $derived((answers.locality as { choice?: string })?.choice === 'oot');

	async function addWriteIn(questionId: string, text: string): Promise<string | null> {
		const res = await fetch(`/api/surveys/${def.id}/ballot`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ questionId, text, playerId: me.id })
		});
		if (!res.ok) throw new Error('write-in failed');
		const body = (await res.json()) as { id: string | null };
		await invalidateAll();
		return body.id;
	}

	async function submit() {
		if (!valid) return;

		// One entry per person; resubmitting overwrites, with a confirmation.
		if (hasSaved && !confirmOverwrite) {
			confirmOverwrite = true;
			return;
		}

		submitting = true;
		submitError = '';
		fieldErrors = {};

		try {
			const res = await fetch(`/api/surveys/${def.id}/response`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ playerId: me.id, answers })
			});

			if (res.ok) {
				done = true;
				await invalidateAll();
				return;
			}

			const body = (await res.json().catch(() => ({}))) as {
				error?: string;
				message?: string;
				errors?: { question: string; message: string }[];
			};

			if (body.error === 'survey_closed') {
				/* Surfaced honestly. The old client did
				   `r.json().catch(() => ({ ok: true }))`, so any non-JSON error
				   response — including the HTML page a lock timeout produced —
				   was reported to the user as a successful save. */
				submitError = 'The commissioner closed this survey — responses are locked now.';
				await invalidateAll();
			} else if (body.errors?.length) {
				fieldErrors = Object.fromEntries(body.errors.map((e) => [e.question, e.message]));
				submitError = 'Some answers need another look.';
			} else {
				submitError = body.message ?? 'Something went wrong saving your response — try again.';
			}
		} catch {
			submitError = "Couldn't reach the server. Check your connection and try again.";
		} finally {
			submitting = false;
			confirmOverwrite = false;
		}
	}
</script>

{#if done}
	<div class="success">
		<div class="stamp">{def.successStamp}</div>
		<h2>You're locked in, {me.display_name.split(' ')[0]}.</h2>
		<p class="q-help">{def.successNote}</p>
		<div class="row">
			<button class="btn btn--ghost" onclick={() => (done = false)}>Make changes</button>
			<a class="btn btn--ghost" href="/">Back to the hub</a>
		</div>
	</div>
{:else}
	{#if hasSaved}
		<p class="notice">
			You already have an answer saved{savedAt ? ` (${savedAt} UTC)` : ''}. Saving again
			overwrites it.
		</p>
	{/if}

	{#each def.sections as section (section.id)}
		{@const shown = section.questions.filter(visible)}
		{#if shown.length}
			<div class="section">
				<div class="down-tag">{section.tag}</div>
				{#if section.blurb}
					<p class="q-help"><RichText text={section.blurb} /></p>
				{/if}

				{#each shown as q (q.id)}
					{#if q.type === 'negotiation'}
						<NegotiationSection
							question={q}
							negotiation={negotiation as never}
							surveyId={def.id}
							{me}
							disabled={!canEdit}
						/>
					{:else}
						<QuestionRenderer
							question={q}
							bind:value={answers[q.id]}
							roster={players}
							playerId={me.id}
							ballotOptions={ballots[q.id] ?? []}
							amount={buyIn}
							{potSize}
							{showMode}
							disabled={!canEdit}
							error={fieldErrors[q.id] ?? ''}
							onwritein={(text) => addWriteIn(q.id, text)}
						/>
					{/if}
				{/each}
			</div>
		{/if}
	{/each}

	{#if canEdit}
		<div class="section submit">
			{#if submitError}
				<p class="notice notice--danger" role="alert">{submitError}</p>
			{/if}

			{#if confirmOverwrite}
				<p class="notice notice--danger">
					You already have a response saved. Locking in now will overwrite it — tap again to
					confirm.
				</p>
			{/if}

			<button class="btn btn--primary" disabled={submitting || !valid} onclick={submit}>
				{#if submitting}
					Locking it in…
				{:else if confirmOverwrite}
					Overwrite my previous answer
				{:else}
					{def.submitLabel}
				{/if}
			</button>

			{#if !valid && firstIssue}
				<p class="hint" role="status">
					{labelFor(firstIssue.question)} — {firstIssue.message}
				</p>
			{/if}
		</div>
	{/if}
{/if}

<style>
	.submit {
		position: sticky;
		bottom: 0;
		background: var(--surface);
		padding-bottom: calc(var(--s-4) + env(safe-area-inset-bottom));
	}

	.hint {
		margin-top: var(--s-2);
		text-align: center;
		font-size: var(--t-sm);
		color: var(--ink-soft);
	}

	.success {
		text-align: center;
	}

	.stamp {
		display: inline-block;
		margin-bottom: var(--s-4);
		padding: var(--s-3) var(--s-5);
		border: 4px double var(--danger);
		border-radius: var(--r-sm);
		color: var(--danger);
		font-family: var(--font-display);
		font-size: var(--t-lg);
		font-weight: 800;
		letter-spacing: 0.08em;
		line-height: 1.1;
		white-space: pre-line;
		transform: rotate(-6deg);
	}

	.success .row {
		justify-content: center;
		margin-top: var(--s-4);
	}
</style>
