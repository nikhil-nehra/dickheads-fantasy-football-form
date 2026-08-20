<script lang="ts">
	import '$lib/styles/app.css';
	import { page } from '$app/state';
	import { fade, fly } from 'svelte/transition';
	import { BANNER, type Scope } from '$lib/voice';
	import { reduced } from '$lib/motion';

	let { children } = $props();

	const LINKS = [
		{ href: '/', label: 'Hub' },
		{ href: '/b/rivalry', label: 'Boards' },
		{ href: '/desk', label: 'The Desk' }
	];

	/* The banner is one component wearing four hats. Which hat is decided by
	   the route, not by page data, so it renders identically on the server
	   before any load function has resolved. */
	const CHROME: Record<Scope, { tag: string; title: [string, string]; stamp: string }> = {
		hub: {
			tag: "THE DICKHEAD'S LEAGUE · 2026",
			title: ["The Dickhead's", 'League Hub'],
			stamp: 'LEAGUE\nBUSINESS'
		},
		survey: {
			tag: 'DRAFT SEASON · 2026',
			title: ["The Dickhead's", 'Fantasy Football Form'],
			stamp: 'OFFICIAL\nLEAGUE FORM'
		},
		board: {
			tag: 'THE BOARDS · ALWAYS ON',
			title: ["The Dickhead's", 'League Boards'],
			stamp: 'PUBLIC\nRECORD'
		},
		desk: {
			tag: "COMMISSIONER'S DESK · RESTRICTED",
			title: ['The Commissioner’s', 'Desk'],
			stamp: 'EYES\nONLY'
		}
	};

	let scope = $derived<Scope>(
		page.url.pathname.startsWith('/s/')
			? 'survey'
			: page.url.pathname.startsWith('/b/')
				? 'board'
				: page.url.pathname.startsWith('/desk')
					? 'desk'
					: 'hub'
	);

	let chrome = $derived(CHROME[scope]);
	let lines = $derived(BANNER[scope]);

	/* Index 0 is what the server renders, so the first paint and the first
	   hydrated frame always agree. Rotation starts a beat later, on a timer. */
	let lineIndex = $state(0);

	$effect(() => {
		const pool = lines;
		lineIndex = 0;

		// Text that changes on its own is motion too — readers who asked for
		// less of it get the first line and nothing more.
		if (reduced() || pool.length < 2) return;

		const id = setInterval(() => {
			lineIndex = (lineIndex + 1) % pool.length;
		}, 7000);

		return () => clearInterval(id);
	});

	function current(href: string): boolean {
		if (href === '/') return page.url.pathname === '/';
		if (href.startsWith('/b/')) return page.url.pathname.startsWith('/b/');
		return page.url.pathname.startsWith(href);
	}
</script>

<a class="skip-link" href="#main">Skip to content</a>

<header class="banner">
	<div class="banner-inner">
		<div class="eyebrow-row">
			<span class="league-tag">{chrome.tag}</span>
			<nav class="nav" aria-label="Main">
				{#each LINKS as link (link.href)}
					<a href={link.href} aria-current={current(link.href) ? 'page' : undefined}>{link.label}</a>
				{/each}
			</nav>
		</div>

		<div class="banner-head">
			<!-- Decorative: the wordmark beside it says the same thing, and the
			     crest's own lettering is unreadable at this size anyway. -->
			<img class="crest" src="/logo-160.png" alt="" width="160" height="160" fetchpriority="high" />
			<h1>{chrome.title[0]}<br />{chrome.title[1]}</h1>
		</div>

		<!-- Keyed so each new line crossfades in rather than swapping. The
		     reserved min-height on .sub stops the header jumping when a longer
		     line follows a shorter one. -->
		<p class="sub">
			{#key lineIndex}
				<span in:fade={{ duration: 320 }}>{lines[lineIndex]}</span>
			{/key}
		</p>

		<span class="stamp stamp--corner" aria-hidden="true">{chrome.stamp}</span>
	</div>
</header>

<!-- Keyed on the pathname only. Changing `?as=` to switch respondent must not
     remount the page, or picking your name would throw away the form. -->
{#key page.url.pathname}
	<main id="main" tabindex="-1" in:fly={{ y: 10, duration: 260, opacity: 0 }}>
		{@render children()}
	</main>
{/key}

<footer class="site-foot">
	<div class="site-foot-inner">
		<!-- The crest reads EST. 2025, so the footer does too. It said
		     "est. whenever" before there was a crest to disagree with. -->
		<span class="league-tag">DFL · EST. 2025 · 14 DICKHEADS</span>
		<p>Surveys close. Boards are forever.</p>
	</div>
</footer>

<style>
	main:focus {
		outline: none;
	}
</style>
