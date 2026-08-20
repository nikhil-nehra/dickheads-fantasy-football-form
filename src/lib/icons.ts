/* ═══════════════════════════════════════════════════════════════════════════
   ICON NAMES
   ═══════════════════════════════════════════════════════════════════════════
   The names live here rather than in Icon.svelte so that plain TypeScript can
   refer to them. Survey definitions attach an icon to a choice, and a `.ts`
   file importing a type out of a `.svelte` file would drag the component into
   every consumer's module graph for the sake of a string union.
   ═══════════════════════════════════════════════════════════════════════════ */

export const ICON_NAMES = [
	'football',
	'helmet',
	'goalpost',
	'flag',
	'whistle',
	'trophy',
	'marker',
	'clipboard',
	'scoreboard',
	'home',
	'away',
	'flame',
	'lock',
	'stopwatch',
	'signal',
	'chevron'
] as const;

export type IconName = (typeof ICON_NAMES)[number];
