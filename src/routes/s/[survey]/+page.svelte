<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import SurveyForm from '$lib/components/SurveyForm.svelte';

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
		<h2>{data.def.title}</h2>
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
			<p class="muted">Pick your name to get started.</p>
		{/if}
	</section>
</div>
