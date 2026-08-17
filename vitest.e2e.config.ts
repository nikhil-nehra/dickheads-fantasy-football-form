import { defineConfig } from 'vitest/config';

/**
 * End-to-end suite. Builds the app, seeds a throwaway D1, serves the real
 * production bundle with wrangler, and drives it over HTTP.
 *
 * Runs sequentially and in a single file-parallel-free process because the
 * tests deliberately share one database and walk a survey through its whole
 * lifecycle in order.
 */
export default defineConfig({
	test: {
		include: ['tests/e2e/**/*.test.ts'],
		environment: 'node',
		globalSetup: ['tests/e2e/setup.ts'],
		fileParallelism: false,
		sequence: { concurrent: false },
		testTimeout: 30_000,
		hookTimeout: 180_000
	}
});
