<script lang="ts">
	import { untrack } from 'svelte';
	import { invalidateAll } from '$app/navigation';
	import { fly } from 'svelte/transition';
	import QuestionRenderer from './QuestionRenderer.svelte';
	import RichText from './RichText.svelte';
	import Icon from './Icon.svelte';
	import NegotiationSection from './NegotiationSection.svelte';
	import { isVisible, type Question, type SurveyDefinition } from '$lib/surveys/types';
	import { validateResponse } from '$lib/surveys/validate';
	import { reveal } from '$lib/motion';
	import { ERRORS, heckle } from '$lib/voice';
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
				submitError = ERRORS.closedMidSession;
				await invalidateAll();
			} else if (body.errors?.length) {
				// Heckled, but never rewritten: the server's actual reason is still
				// the body of every message, keyed so it doesn't reshuffle while
				// somebody is reading it.
				fieldErrors = Object.fromEntries(
					body.errors.map((e) => [e.question, heckle(e.message, e.question)])
				);
				submitError = ERRORS.someWrong;
			} else {
				submitError = body.message ?? ERRORS.generic;
			}
		} catch {
			submitError = ERRORS.network;
		} finally {
			submitting = false;
			confirmOverwrite = false;
		}
	}
</script>

{#if done}
	<div class="success" in:fly={{ y: 12, duration: 320 }}>
		<div class="stamp stamp--big stamp--slam">{def.successStamp}</div>
		<h2 class="display">You're locked in, {me.display_name.split(' ')[0]}.</h2>
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
			overwrites it, and the old one is gone for good.
		</p>
	{/if}

	{#each def.sections as section, i (section.id)}
		{@const shown = section.questions.filter(visible)}
		{#if shown.length}
			<div class="section" use:reveal={{ index: i, step: 40 }}>
				<!-- The chain gang: the marker moves up as each section arrives. -->
				<div class="down-tag">
					<Icon name="marker" size={13} class="icon--advance" />
					{section.tag}
				</div>
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
		{#if submitError}
			<p class="notice notice--danger" role="alert">{submitError}</p>
		{/if}

		{#if confirmOverwrite}
			<p class="notice notice--danger">{ERRORS.overwrite}</p>
		{/if}

		<!-- The sticky gold bar from the original, which is the single reason
		     nobody ever lost a half-filled form: the way out is always on
		     screen, and it tells you what is standing between you and it. -->
		<div class="savebar">
			{#if !submitting && !valid && firstIssue}
				<!-- Keyed on the offending question, so the flag is re-thrown each
				     time a different thing is wrong rather than sitting there. -->
				{#key firstIssue.question}
					<span class="penalty"><Icon name="flag" size={22} class="icon--drop" /></span>
				{/key}
			{/if}

			<p class="savebar-txt" role="status">
				{#if submitting}
					Locking it in…
				{:else if !valid && firstIssue}
					{heckle(`${labelFor(firstIssue.question)} — ${firstIssue.message}`, firstIssue.question)}
				{:else}
					Everything checks out. Last chance to be sensible.
				{/if}
			</p>

			<button class="btn btn--primary" disabled={submitting || !valid} onclick={submit}>
				{#if submitting}
					<Icon name="football" size={18} class="icon--spin" />
					Locking it in…
				{:else if confirmOverwrite}
					<Icon name="flag" size={18} />
					Overwrite it
				{:else}
					<Icon name="lock" size={18} />
					{def.submitLabel}
				{/if}
			</button>
		</div>
	{/if}
{/if}

<style>
	.penalty {
		flex: 0 0 auto;
		display: inline-flex;
		color: var(--gold);
	}

	.success {
		padding: var(--s-6) var(--s-2);
		text-align: center;
	}

	.success .stamp {
		margin-bottom: var(--s-5);
	}

	.success h2 {
		font-size: var(--t-xl);
		text-wrap: balance;
	}

	.success .q-help {
		margin-top: var(--s-2);
	}

	.success .row {
		justify-content: center;
		margin-top: var(--s-5);
	}
</style>
