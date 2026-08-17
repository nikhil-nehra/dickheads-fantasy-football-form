import { defineConfig } from 'vitest/config';

/**
 * Deliberately separate from vite.config.ts.
 *
 * The Cloudflare plugin makes `vite dev` run inside workerd, which is exactly
 * what we want for the app — but these are pure unit tests over plain modules
 * (validators, tallies, pairing, the redirect script), so they run in plain
 * Node with no plugins and start in well under a second.
 */
export default defineConfig({
	test: {
		include: ['tests/unit/**/*.test.ts'],
		environment: 'node'
	}
});
