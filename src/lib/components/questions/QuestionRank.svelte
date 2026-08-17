<script lang="ts">
	import RankList from '$lib/components/RankList.svelte';
	import type { RankItem } from '$lib/components/types';
	import type { RankQuestion } from '$lib/surveys/types';

	let {
		question,
		value = $bindable([]),
		roster = [],
		playerId,
		disabled = false
	}: {
		question: RankQuestion;
		value: string[];
		roster?: { id: string; display_name: string }[];
		playerId?: string;
		disabled?: boolean;
	} = $props();

	// A roster-sourced ranking is resolved per respondent, so nobody is ever
	// asked to rank themselves.
	let items = $derived<RankItem[]>(
		question.source.kind === 'fixed'
			? question.source.options.map((o) => ({ id: o.id, label: o.label, sub: o.sub }))
			: roster
					.filter(
						(p) =>
							(question.source as { excludeSelf?: boolean }).excludeSelf === false ||
							p.id !== playerId
					)
					.map((p) => ({ id: p.id, label: p.display_name }))
	);

	// Keep the order valid when the option set changes — someone joins the
	// roster mid-season, or the respondent switches. Keep what we have, append
	// what's new, drop what no longer exists.
	$effect(() => {
		const ids = items.map((i) => i.id);
		const current = value ?? [];
		const kept = current.filter((id) => ids.includes(id));
		const added = ids.filter((id) => !kept.includes(id));
		if (kept.length !== current.length || added.length) value = [...kept, ...added];
	});
</script>

<RankList
	{items}
	bind:order={value}
	heatmap={question.heatmap}
	topLabel={question.topLabel}
	bottomLabel={question.bottomLabel}
	{disabled}
	label={question.prompt}
/>
