import type { LayoutServerLoad } from './$types';

/* One seed per document, and nothing else.
   ---------------------------------------------------------------------------
   The banner stamp hashes this to choose its heckle. Picking on the client
   would give one line on the server and another after hydration — the exact
   mismatch voice.ts warns about — so the choice is made once, here, and both
   sides read the same number.

   This load touches neither `url` nor `params`, so SvelteKit will not re-run
   it on a client-side navigation. The heckle therefore survives every link you
   click and changes only on a real page reload, which is the whole point of
   it: a line you can finish reading. */
export const load: LayoutServerLoad = () => ({
	stampSeed: crypto.randomUUID()
});
