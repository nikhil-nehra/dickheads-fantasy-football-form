import adapter from '@sveltejs/adapter-cloudflare';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	preprocess: vitePreprocess(),
	kit: {
		adapter: adapter()
		// SvelteKit checks the Origin header on form POSTs by default. That is the
		// first line of write protection; hooks.server.ts adds the same check for
		// JSON API routes, which SvelteKit does not cover.
	}
};

export default config;
