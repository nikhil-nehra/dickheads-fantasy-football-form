<script lang="ts">
	import '$lib/styles/app.css';
	import { page } from '$app/state';

	let { children } = $props();

	const LINKS = [
		{ href: '/', label: 'Hub' },
		{ href: '/b/rivalry', label: 'The Boards' },
		{ href: '/desk', label: "Commissioner's Desk" }
	];

	function current(href: string): boolean {
		if (href === '/') return page.url.pathname === '/';
		if (href.startsWith('/b/')) return page.url.pathname.startsWith('/b/');
		return page.url.pathname.startsWith(href);
	}
</script>

<a class="skip-link" href="#main">Skip to content</a>

<header class="banner">
	<h1>The Dickhead's League</h1>
	<p class="sub">Est. whenever · 14 dickheads</p>
	<nav class="nav" aria-label="Main">
		{#each LINKS as link}
			<a href={link.href} aria-current={current(link.href) ? 'page' : undefined}>{link.label}</a>
		{/each}
	</nav>
</header>

<main id="main" tabindex="-1">
	{@render children()}
</main>

<style>
	main:focus {
		outline: none;
	}
</style>
