<script lang="ts">
	/**
	 * Renders the only markup survey copy is allowed to use: **bold**.
	 *
	 * It works by SPLITTING the string and letting Svelte escape each piece —
	 * never by injecting HTML. The old site hand-rolled escaping with `esc()`
	 * and `jsStr()`, applied them inconsistently (index.html never called
	 * `esc` at all), and `jsStr` didn't escape double quotes while its output
	 * was interpolated into onclick="…" attributes carrying player-written
	 * punishment text. That was a real, reachable XSS. There is no equivalent
	 * hole here because no path builds markup from data.
	 */
	let { text = '', class: klass = '' }: { text?: string; class?: string } = $props();

	// Odd indices sit between a pair of asterisks.
	let parts = $derived(text.split('**'));
</script>

<span class={klass}
	>{#each parts as part, i}{#if i % 2 === 1}<strong>{part}</strong>{:else}{part}{/if}{/each}</span
>
