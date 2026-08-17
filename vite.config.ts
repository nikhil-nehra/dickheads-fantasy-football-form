import { sveltekit } from '@sveltejs/kit/vite';
import { cloudflare } from '@cloudflare/vite-plugin';
import { defineConfig } from 'vite';

/**
 * The Cloudflare plugin is loaded for `vite dev` ONLY.
 *
 * In dev it runs the server inside workerd with the real bindings from
 * wrangler.toml, so `platform.env.DB` is an actual local D1 database rather
 * than a stub — the same code path as production.
 *
 * It is excluded everywhere else for two reasons: @sveltejs/adapter-cloudflare
 * owns the production bundle, and the plugin resolves wrangler.toml's `main`
 * (a build artifact) at config load, which fails on a clean checkout where
 * nothing has been built yet. That broke `npm run check` in CI while passing
 * locally, because local runs had a stale build lying around.
 *
 * Keyed off argv rather than Vite's `command`, because svelte-check and
 * svelte-kit sync also load this config with command === 'serve'.
 */
const isDevServer = process.argv.includes('dev');

export default defineConfig({
	plugins: [sveltekit(), ...(isDevServer ? [cloudflare()] : [])]
});
