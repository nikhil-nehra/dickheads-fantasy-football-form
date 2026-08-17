<script lang="ts">
	import { STATUS_META } from '$lib/status';
	import type { SurveyStatus } from '$lib/server/db';

	let { data } = $props();

	// Already filtered server-side: drafts only reach a commissioner's browser.
	let live = $derived(data.surveys.filter((s) => s.status !== 'archived'));
	let archived = $derived(data.surveys.filter((s) => s.status === 'archived'));

	let showArchive = $state(false);
</script>

<svelte:head>
	<title>The Dickhead's League</title>
	<meta
		name="description"
		content="Surveys, boards and a commissioner's desk for a 14-person fantasy football league."
	/>
</svelte:head>

<div class="shell">
	<section class="card">
		<h2>Surveys</h2>
		<p class="q-help">Surveys close. Boards are forever.</p>

		{#if live.length === 0}
			<p class="muted">Nothing open right now. Check the boards.</p>
		{/if}

		<div class="stack">
			{#each live as s (s.id)}
				{@const meta = STATUS_META[s.status as SurveyStatus]}
				<a class="tile" href="/s/{s.id}">
					<div class="tile-head">
						<span class="tile-title">{s.title}</span>
						<span class="badge badge--{s.status}">{meta.hubLabel}</span>
					</div>
					<p class="q-help">{s.blurb}</p>
					<div class="tile-foot">
						<div class="meter" aria-hidden="true">
							<i style="width:{data.rosterSize ? (s.count / data.rosterSize) * 100 : 0}%"></i>
						</div>
						<span class="faint">{s.count} / {data.rosterSize} in</span>
					</div>
				</a>
			{/each}
		</div>
	</section>

	<section class="card">
		<h2>The Boards</h2>
		<p class="q-help">Permanent and public. These keep working after a survey shuts.</p>
		<div class="stack">
			{#each data.boards as b (b.id)}
				<a class="tile" href="/b/{b.id}">
					<div class="tile-head"><span class="tile-title">{b.title}</span></div>
					<p class="q-help">{b.blurb}</p>
				</a>
			{/each}
		</div>
	</section>

	{#if archived.length}
		<section class="card">
			<button class="btn btn--ghost" onclick={() => (showArchive = !showArchive)}
				aria-expanded={showArchive}>
				{showArchive ? 'Hide' : 'Show'} archive ({archived.length})
			</button>
			{#if showArchive}
				<div class="stack" style="margin-top:var(--s-3)">
					{#each archived as s (s.id)}
						<a class="tile" href="/s/{s.id}">
							<div class="tile-head">
								<span class="tile-title">{s.title}</span>
								<span class="badge badge--archived">Archived</span>
							</div>
							<span class="faint">{s.count} / {data.rosterSize} answered</span>
						</a>
					{/each}
				</div>
			{/if}
		</section>
	{/if}
</div>

<style>
	.tile {
		display: block;
		padding: var(--s-4);
		border: 1px solid var(--border);
		border-radius: var(--r-md);
		background: var(--surface-2);
		text-decoration: none;
		transition: border-color 0.15s ease, transform 0.15s ease;
	}

	@media (hover: hover) {
		.tile:hover {
			border-color: var(--gold);
			transform: translateY(-1px);
		}
	}

	.tile-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--s-2);
		margin-bottom: var(--s-1);
	}

	.tile-title {
		font-weight: 800;
		font-size: var(--t-md);
	}

	.tile-foot {
		display: flex;
		align-items: center;
		gap: var(--s-3);
		margin-top: var(--s-3);
	}

	.tile-foot .meter {
		flex: 1;
	}
</style>
