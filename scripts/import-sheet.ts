/* ═══════════════════════════════════════════════════════════════════════════
   ONE-OFF: import the old Google Sheet's intake responses
   ═══════════════════════════════════════════════════════════════════════════
   Reads the Sheet export and converts each row from the old payload shape to
   the current one, then emits SQL.

   It validates every converted row with the SAME validator the live API uses,
   so nothing can be imported that a real submission would have been rejected
   for. If a row fails, it is reported and skipped rather than written.

   Input and output both live in context/, which is gitignored: this is 13
   named league members' answers and the repository is public.

     npm run import:sheet          # convert, validate, report, write SQL
     npm run db:import:remote      # apply it

   Two names need remapping, both documented in the old README:
     "Mattew Yoshida"  ->  matthew-yoshida   (spelling was corrected)
     "Pranav Chelat"   ->  samay-mohapatra   (Samay replaced him; his answers
                                              carry over, by commissioner's
                                              decision)
   ═══════════════════════════════════════════════════════════════════════════ */

import { readFileSync, writeFileSync } from 'node:fs';
import { intake } from '../src/lib/surveys/intake';
import { validateResponse } from '../src/lib/surveys/validate';
import type { AvailabilityQuestion } from '../src/lib/surveys/types';
import { questionById } from '../src/lib/surveys/types';

const IN = 'context/Dickhead Fantasy Football Responses - responses.csv';
const OUT = 'context/import-intake.sql';

/** Old display name -> current player id. */
const RENAMES: Record<string, string> = {
	'Mattew Yoshida': 'matthew-yoshida',
	'Pranav Chelat': 'samay-mohapatra'
};

type OldPayload = {
	name?: string;
	buyIn?: string;
	punishment?: string;
	locality?: string;
	weekendOrder?: string[];
	cantMake?: Record<string, boolean>;
	inPerson?: Record<string, boolean>;
	beefOrder?: string[];
	prizePlan?: null | { places: number[]; regSeason: number };
};

function slug(name: string): string {
	return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-');
}

function playerIdFor(name: string): string {
	return RENAMES[name.trim()] ?? slug(name);
}

/** Split on newlines that sit outside a quoted field. */
function splitRows(raw: string): string[] {
	const rows: string[] = [];
	let cur = '';
	let quoted = false;

	for (let i = 0; i < raw.length; i++) {
		const ch = raw[i];
		if (ch === '"') {
			if (quoted && raw[i + 1] === '"') {
				cur += '""';
				i++;
				continue;
			}
			quoted = !quoted;
		}
		if (ch === '\n' && !quoted) {
			rows.push(cur);
			cur = '';
		} else if (ch !== '\r' || quoted) {
			cur += ch;
		}
	}
	if (cur.trim()) rows.push(cur);
	return rows;
}

function parseRow(row: string): { key: string; payload: OldPayload } | null {
	const firstComma = row.indexOf(',');
	if (firstComma < 0) return null;
	const key = row.slice(0, firstComma);

	const rest = row.slice(firstComma + 1);
	const lastComma = rest.lastIndexOf(',');
	let value = lastComma > 0 ? rest.slice(0, lastComma) : rest;

	if (value.startsWith('"') && value.endsWith('"')) {
		value = value.slice(1, -1).replace(/""/g, '"');
	}

	try {
		return { key, payload: JSON.parse(value) as OldPayload };
	} catch {
		return null;
	}
}

/** Convert one old payload into the current answers shape. */
function convert(old: OldPayload, playerId: string, rosterIds: string[]) {
	const availability = questionById(intake, 'availability') as AvailabilityQuestion;

	// "$100" -> "100": option ids are the bare dollar amounts.
	const buyIn = (old.buyIn ?? '').replace(/[^0-9]/g, '');

	// { w1fri: true } -> ["w1fri"]
	const unavailable = Object.entries(old.cantMake ?? {})
		.filter(([, off]) => off)
		.map(([slot]) => slot);

	// The old UI only recorded an explicit "virtual" choice; absence meant in
	// person. Make it explicit — but only for weekends they can partly make,
	// which is exactly when the new UI shows the choice.
	const mode: Record<string, string> = {};
	if (old.locality === 'oot') {
		for (const w of availability.windows) {
			const allOff = w.slots.every((s) => unavailable.includes(s.id));
			if (allOff) continue;
			mode[w.id] = old.inPerson?.[w.id] === false ? 'virtual' : 'in-person';
		}
	}

	// Names -> stable ids, then repair: keep their order, append anyone they
	// could not have ranked (Samay did not exist on the old roster).
	const ranked = (old.beefOrder ?? []).map(playerIdFor).filter((id) => id !== playerId);
	const seen = new Set<string>();
	const beef = ranked.filter((id) => rosterIds.includes(id) && !seen.has(id) && seen.add(id));
	for (const id of rosterIds) {
		if (id !== playerId && !beef.includes(id)) beef.push(id);
	}

	const prizeSplit = old.prizePlan
		? { buckets: old.prizePlan.places, carveOut: old.prizePlan.regSeason ?? 0 }
		: { abstain: true as const };

	return {
		buyIn: { choice: buyIn },
		punishment: (old.punishment ?? '').trim(),
		locality: { choice: old.locality ?? '' },
		availability: { order: old.weekendOrder ?? [], unavailable, mode },
		beef,
		prizeSplit
	};
}

/* ── Run ─────────────────────────────────────────────────────────────────── */

const seed = readFileSync('db/seed.sql', 'utf8');
const roster = [...seed.matchAll(/\('([a-z-]+)',\s*'([^']+)',/g)].map((m) => ({
	id: m[1],
	name: m[2]
}));
const rosterIds = roster.map((p) => p.id);
const nameOf = new Map(roster.map((p) => [p.id, p.name]));

const rows = splitRows(readFileSync(IN, 'utf8')).slice(1).filter((r) => r.trim());

const statements: string[] = [];
const ok: string[] = [];
const skipped: string[] = [];

for (const row of rows) {
	const parsed = parseRow(row);
	if (!parsed) {
		skipped.push('(unparseable row)');
		continue;
	}

	const { key, payload } = parsed;
	if (!key.startsWith('response:')) continue;

	const oldName = key.slice('response:'.length);
	const playerId = playerIdFor(oldName);

	if (!rosterIds.includes(playerId)) {
		skipped.push(`${oldName} -> no current player (${playerId})`);
		continue;
	}

	const answers = convert(payload, playerId, rosterIds);

	// The real gate. Anything a live submission would be rejected for is
	// rejected here too, rather than written into the database.
	const result = validateResponse(intake, answers, {
		playerId,
		rosterIds,
		ballotOptions: {}
	});

	if (!result.ok) {
		skipped.push(
			`${oldName} -> ${result.errors.map((e) => `${e.question}: ${e.message}`).join('; ')}`
		);
		continue;
	}

	const json = JSON.stringify(result.value).replace(/'/g, "''");
	statements.push(
		`INSERT INTO response (survey_id, player_id, answers, created_at, updated_at)\n` +
			`SELECT 'intake', '${playerId}', '${json}', datetime('now'), datetime('now')\n` +
			` WHERE EXISTS (SELECT 1 FROM player WHERE id = '${playerId}' AND active = 1)\n` +
			` ON CONFLICT(survey_id, player_id) DO UPDATE SET answers = excluded.answers, updated_at = datetime('now');`
	);

	const note = oldName === nameOf.get(playerId) ? '' : `  (was "${oldName}")`;
	ok.push(`${nameOf.get(playerId)}${note}`);
}

const header =
	`-- Generated by scripts/import-sheet.ts from the old Google Sheet export.\n` +
	`-- Contains league members' answers: gitignored, do not commit.\n` +
	`-- Idempotent — re-running overwrites with the same values.\n\n`;

writeFileSync(OUT, header + statements.join('\n\n') + '\n');

console.log(`Converted and validated ${ok.length} of ${rows.length} rows.\n`);
ok.forEach((n) => console.log('  ok    ' + n));
if (skipped.length) {
	console.log();
	skipped.forEach((s) => console.log('  skip  ' + s));
}

const missing = roster.filter((p) => !ok.some((n) => n.startsWith(p.name)));
console.log(`\nStill to answer: ${missing.map((p) => p.name).join(', ') || '(nobody)'}`);
console.log(`\nWrote ${OUT}`);
