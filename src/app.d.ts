/// <reference types="@cloudflare/workers-types" />

declare global {
	namespace App {
		interface Platform {
			env: {
				DB: D1Database;
				ASSETS: Fetcher;
				/** Set with `wrangler secret put COMMISH_PIN`. Never sent to the browser. */
				COMMISH_PIN: string;
				SLEEPER_LEAGUE_ID: string;
				SEASON: string;
				/** Per-IP mutations per minute. Defaults to 40 when unset. */
				RATE_LIMIT_PER_MIN?: string;
			};
			context: { waitUntil(promise: Promise<unknown>): void };
			caches: CacheStorage & { default: Cache };
		}

		interface Locals {
			/** True when a valid commissioner session cookie was presented. */
			isCommissioner: boolean;
		}

		interface Error {
			message: string;
		}
	}
}

export {};
