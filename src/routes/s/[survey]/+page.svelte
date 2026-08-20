<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { fly } from 'svelte/transition';
	import SurveyForm from '$lib/components/SurveyForm.svelte';
	import { EMPTY, NAG } from '$lib/voice';

	let { data } = $props();

	let canEdit = $derived(data.statusMeta.writable && !!data.me);

	function pickName(e: Event) {
		const id = (e.currentTarget as HTMLSelectElement).value;
		const url = new URL(page.url);
		if (id) url.searchParams.set('as', id);
		else url.searchParams.delete('as');
		goto(url, { noScroll: true, keepFocus: true });
	}
</script>

<svelte:head>
	<title>{data.def.title} — The Dickhead's League</title>
	<meta name="description" content={data.def.blurb} />
</svelte:head>

<div class="shell">
	<section class="card">
		<h2 class="display title">{data.def.title}</h2>
		<p class="q-help">{data.def.blurb}</p>

		{#if !data.statusMeta.writable}
			<div class="notice notice--danger">
				<strong>{data.statusMeta.label}.</strong>
				{data.statusMeta.note}
				{#if data.me}Your saved answers are shown below.{/if}
			</div>
		{/if}

		<!-- Identity. No password: anyone could pick anyone's name. That is the
		     trust model for a 14-person friends' league, and it is deliberate.
		     It lives in the URL so a refresh keeps you as yourself and the page
		     can server-render your saved answers. -->
		<div class="section">
			<div class="down-tag">Starting lineup</div>
			<label for="who">Who's filling this out?</label>
			<select id="who" onchange={pickName} value={data.me?.id ?? ''}>
				<option value="">Pick your name…</option>
				{#each data.players as p (p.id)}
					<option value={p.id}>{p.display_name}</option>
				{/each}
			</select>

			{#if data.me}
				<!-- Keyed on the respondent so it replays every time somebody
				     changes their mind about who they are. -->
				{#key data.me.id}
					<p class="nag" in:fly={{ y: -8, duration: 420 }}>
						<span>{NAG.first}</span>
						<span class="nag-second">{NAG.second}</span>
					</p>
				{/key}
			{/if}
		</div>

		{#if data.me}
			<!-- Keyed on the respondent, so switching names remounts the form with
			     fresh state instead of leaving the previous person's answers in
			     the fields. -->
			{#key data.me.id}
				<SurveyForm
					def={data.def}
					me={data.me}
					players={data.players}
					initialAnswers={data.answers}
					ballots={data.ballots}
					negotiation={data.negotiation}
					hasSaved={data.hasSaved}
					savedAt={data.savedAt}
					{canEdit}
				/>
			{/key}
		{:else}
			<p class="muted unpicked">{EMPTY.notPicked}</p>
		{/if}
	</section>
</div>

<style>
	.title {
		font-size: var(--t-xl);
		margin-bottom: var(--s-2);
	}

	/* The nag, straight from the original: a soft amber slip of paper that
	   appears the moment somebody picks a name. Tokenised rather than the
	   original's three literals, so it survives dark mode. */
	.nag {
		margin-top: var(--s-3);
		padding: var(--s-3);
		border-radius: var(--r-md);
		border: 1px solid var(--accent);
		background: var(--warn-soft);
		color: var(--warn);
		font-size: var(--t-sm);
		font-weight: 600;
		line-height: 1.5;
	}

	.nag-second {
		display: block;
		margin-top: var(--s-2);
		font-weight: 800;
		color: var(--ink);
	}

	.unpicked {
		padding: var(--s-5) var(--s-4);
		border: 1.5px dashed var(--border-strong);
		border-radius: var(--r-md);
		background: var(--surface-2);
		text-align: center;
		font-size: var(--t-sm);
	}
</style>
