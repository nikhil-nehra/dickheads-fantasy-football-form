<script lang="ts">
	import '$lib/styles/app.css';
	import { page } from '$app/state';
	import { fly } from 'svelte/transition';
	import { BANNER, pick, type Scope } from '$lib/voice';

	let { children, data } = $props();

	const LINKS = [
		{ href: '/', label: 'Hub' },
		{ href: '/b/rivalry', label: 'Boards' },
		{ href: '/desk', label: 'The Desk' }
	];

	/* The banner is one component wearing four hats. Which hat is decided by
	   the route, not by page data, so it renders identically on the server
	   before any load function has resolved. */
	const CHROME: Record<Scope, { tag: string; title: [string, string] }> = {
		hub: {
			tag: "THE DICKHEAD'S LEAGUE · 2026",
			title: ["The Dickhead's", 'League Hub']
		},
		survey: {
			tag: 'DRAFT SEASON · 2026',
			title: ["The Dickhead's", 'Fantasy Football Form']
		},
		board: {
			tag: 'THE BOARDS · ALWAYS ON',
			title: ["The Dickhead's", 'League Boards']
		},
		desk: {
			tag: "COMMISSIONER'S DESK · RESTRICTED",
			title: ['The Commissioner’s', 'Desk']
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

	/* The heckle used to be a subtitle that crossfaded to the next line every
	   seven seconds — a sentence that moved out from under you mid-read, and
	   the reason the banner reserved three empty ems for it. It is now the
	   stamp in the corner, which is where the joke belonged: something the
	   commissioner slapped on the page rather than a caption.

	   One line per document. The seed comes from the server (see
	   +layout.server.ts) so the two renders agree, and it only changes when
	   the page is reloaded — clicking around the site does not reroll it. The
	   scope is mixed into the key so the four pools do not all land on the
	   same index for a given seed. */
	let heckle = $derived(pick(BANNER[scope], `${data.stampSeed}:${scope}`));

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

			<!-- Shrink-wrapped around the lettering so the stamp can hang off
			     where the words actually end, not off the column's right edge —
			     the titles are two and three lines long and end in different
			     places. -->
			<div class="wordmark">
				<h1>{chrome.title[0]}<br />{chrome.title[1]}</h1>

				<!-- Not aria-hidden, unlike the LEAGUE BUSINESS block it
				     replaces: this one carries the only prose in the header, so
				     it has to be readable by something other than eyes. -->
				<p
					class="stamp stamp--heckle stamp--boil"
					style="--boil-1:url('#boil-a'); --boil-2:url('#boil-b'); --boil-3:url('#boil-c')"
				>
					{heckle}
				</p>
			</div>
		</div>
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

<!-- The boil. Three noise fields, identical but for their seed; the stamp
     flips between them a few times a second, so its border and lettering
     crawl the way a hand-inked line does when it is redrawn every frame.
     Kept here rather than in a component because a filter has to live in the
     document to be referenced by url(#id), and the banner is the only thing
     that uses it. -->
<svg class="boil-defs" aria-hidden="true" focusable="false" width="0" height="0">
	<filter id="boil-a" x="-6%" y="-16%" width="112%" height="132%" color-interpolation-filters="sRGB">
		<feTurbulence type="fractalNoise" baseFrequency="0.021 0.038" numOctaves="2" seed="2" result="n" />
		<feDisplacementMap in="SourceGraphic" in2="n" scale="2.4" xChannelSelector="R" yChannelSelector="G" />
	</filter>
	<filter id="boil-b" x="-6%" y="-16%" width="112%" height="132%" color-interpolation-filters="sRGB">
		<feTurbulence type="fractalNoise" baseFrequency="0.021 0.038" numOctaves="2" seed="9" result="n" />
		<feDisplacementMap in="SourceGraphic" in2="n" scale="2.4" xChannelSelector="R" yChannelSelector="G" />
	</filter>
	<filter id="boil-c" x="-6%" y="-16%" width="112%" height="132%" color-interpolation-filters="sRGB">
		<feTurbulence type="fractalNoise" baseFrequency="0.021 0.038" numOctaves="2" seed="17" result="n" />
		<feDisplacementMap in="SourceGraphic" in2="n" scale="2.4" xChannelSelector="R" yChannelSelector="G" />
	</filter>
</svg>

<style>
	main:focus {
		outline: none;
	}

	/* Present only to hold the filters. Not display:none — Safari drops
	   filters defined inside a hidden subtree. */
	.boil-defs {
		position: absolute;
		width: 0;
		height: 0;
		overflow: hidden;
	}
</style>
