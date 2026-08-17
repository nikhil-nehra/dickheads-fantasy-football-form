import type { SurveyStatus } from './server/db';

/* ═══════════════════════════════════════════════════════════════════════════
   THE LIFECYCLE
   ═══════════════════════════════════════════════════════════════════════════
   ONE definition of what each status means. The old site had three that
   disagreed: STATUS_META.writable in league.js (never actually read),
   LeagueStatus.isOpen() in the client, and WRITABLE_STATUSES in Code.gs —
   with different defaulting rules, so an unrecognised status failed open in
   the browser and closed on the server.
   ═══════════════════════════════════════════════════════════════════════════ */

export const STATUS_META: Record<
	SurveyStatus,
	{ label: string; hubLabel: string; writable: boolean; listed: boolean; note: string }
> = {
	draft: {
		label: 'Draft',
		hubLabel: 'Not released yet',
		writable: false,
		listed: false,
		note: 'Hidden from the league. You can open the page to preview it; nothing saves.'
	},
	open: {
		label: 'Open',
		hubLabel: 'Open now',
		writable: true,
		listed: true,
		note: 'Listed on the hub and accepting answers.'
	},
	closed: {
		label: 'Closed',
		hubLabel: 'Voting closed',
		writable: false,
		listed: true,
		note: 'Read-only. People can still see their own saved answers. Boards keep working.'
	},
	archived: {
		label: 'Archived',
		hubLabel: 'Archived',
		writable: false,
		listed: false,
		note: 'Tucked into the hub archive. Same as closed, just out of the way.'
	}
};

export const ALL_STATUSES = Object.keys(STATUS_META) as SurveyStatus[];

export function isOpen(status: SurveyStatus | undefined): boolean {
	return status ? STATUS_META[status].writable : false;
}
