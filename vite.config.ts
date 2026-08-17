import { sveltekit } from '@sveltejs/kit/vite';
import { cloudflare } from '@cloudflare/vite-plugin';
import { defineConfig } from 'vite';

export default defineConfig(({ command }) => ({
	plugins: [
		sveltekit(),
		// Dev only. The plugin runs the dev server inside workerd with the real
		// bindings from wrangler.toml, so `platform.env.DB` in development is an
		// actual local D1 database rather than a stub — the same code path as
		// production.
		//
		// It is excluded from `vite build` because @sveltejs/adapter-cloudflare
		// owns the production bundle; running both would have them fight over
		// the same worker entry.
		...(command === 'serve' ? [cloudflare()] : [])
	],
	// Unit tests use vitest.config.ts — see the note there.
}));
