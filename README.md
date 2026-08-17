# The Dickhead's Fantasy Football League

A site for running a 14-person fantasy league: surveys with a real open/closed
lifecycle, permanent public result boards, a commissioner's desk, and live
league data pulled from Sleeper.

**Surveys close. Boards are forever.**

A survey is a thing people fill in; it has a lifecycle and eventually stops
accepting answers. A board is a permanent, public, read-only view of results
that keeps working long after its survey is shut. That separation is what lets
you close things down without ever breaking a link you've already shared.

---

## Quick reference

| Thing | Value |
|---|---|
| Runs on | Cloudflare Workers + D1, one origin for site and API |
| Framework | SvelteKit 2 / Svelte 5, server-rendered |
| Commissioner PIN | a Worker secret — never in this repo, never in the browser |
| Add a player | a row in `player`, or let the Sleeper sync link them |
| Add a survey | one file in `src/lib/surveys/` |
| Open & close surveys | Commissioner's Desk → League Control |
| The link to paste in Sleeper | `…/b/rivalry` |

---

## What's here

```
src/
  lib/
    surveys/          survey DEFINITIONS — the data that drives everything
      types.ts        the question type system
      intake.ts       Survey 1
      rivalry.ts      Survey 2
      validate.ts     schema derived from a definition, enforced on the server
      defaults.ts     starting values, computed server-side so SSR is complete
    components/       one component per question type, plus shared chrome
    server/           db.ts · auth.ts · ballot.ts · sleeper.ts
    boards/           board definitions
    tally.ts          aggregation, by question type
    negotiation.ts    deriving agreement
    pairing.ts        auto-pairing from beef rankings
  routes/
    +page.svelte              the hub
    s/[survey]/               ONE renderer for every survey
    b/[board]/                the public boards
    desk/                     the commissioner's desk
    api/                      writes
  hooks.server.ts     origin checks and rate limiting
db/
  migrations/         the schema
  seed.sql            the roster
workers/sleeper-sync/ the cron worker
docs/                 redirect stubs for the old GitHub Pages URLs
legacy/               the previous implementation, kept for reference
tests/unit/           84 tests over the pure logic
tests/e2e/            31 tests over the real bundle, on a throwaway D1
```

---

## The survey lifecycle

Every survey is in exactly one of four states, changed from **Commissioner's
Desk → League Control**. No code, no git, works from a phone.

| Status | On the hub | The page | Writes |
|---|---|---|---|
| **Draft** | Hidden | 404 for everyone but the commissioner | Blocked |
| **Open** | Listed, green badge | Normal | Accepted |
| **Closed** | Listed, red badge | Read-only, shows you your own saved answers | **Rejected by the server** |
| **Archived** | In the hub archive | Same as closed | Rejected |

**Closing is real.** The status check lives *inside* the write statement:

```sql
INSERT INTO response (...)
SELECT ?1, ?2, ?3, datetime('now'), datetime('now')
 WHERE EXISTS (SELECT 1 FROM survey s WHERE s.id = ?1 AND s.status IN ('open'))
 ON CONFLICT(survey_id, player_id) DO UPDATE SET ...
```

There is no window between reading the status and committing the answer, so a
survey that closes mid-session rejects the write rather than racing it. You get
a real `409`, and the page says so.

**Reactivating is one tap.** Closing never deletes anything. Set it back to Open
and everyone picks up exactly where they left off.

**Boards never close.** The board loaders simply never read `survey.status`.
That is what makes `…/b/rivalry` safe to paste into league chat once and never
touch again.

---

## Adding a survey

One file in `src/lib/surveys/`, plus one line in `src/lib/surveys/index.ts`.

It then appears on the hub with a live status badge and a real response count,
gets a route at `/s/<id>`, gets a tab on the Desk with type-appropriate
tallies, and gets open/close controls. Nothing in the app switches on a survey
id, so there is nowhere else to remember to edit.

Question types available: `single`, `multi`, `text`, `rank`, `availability`,
`allocation`, `ballot`, `negotiation`. A definition is pure data — `**bold**`
is the only markup the copy supports, and it is rendered by splitting the
string, never by injecting HTML.

---

## The negotiation

You and your assigned rival negotiate three things: the rivalry name, the set
bet, and the side punishment. You both propose, you both see everything, and
each line only locks when **the two of you land on the same answer**. Matching
ignores case and spacing.

There is no race and nobody can lock the other out: the table's primary key is
`(pairing, field, player)`, so each player can only ever write their own row,
and "agreed" is *derived* by comparing the two. It is never stored. Either side
can reopen a line to reneg.

If a pair stalls, the commissioner can force a ruling from the Desk, which
overrides both picks and can be withdrawn to hand the decision back.

---

## Sleeper

`workers/sleeper-sync/` is a separate Worker on a cron, bound to the same
database. It writes snapshots into `sleeper_cache`; **the app never calls
Sleeper on a request path**, so page loads carry no third-party latency and the
site keeps working (with older data, stamped) when Sleeper is down.

It syncs every 10 minutes — about five API calls, against Sleeper's guidance of
staying under 1000 a minute — and pulls the playoff brackets once a day.

What it gives you:

- **Standings board** — real records and points, straight from the league.
- **Roster linking** — see below. Automatic exact-name matching links nobody in
  this league, so the Desk suggests and you confirm.
- **The punishment's victim, resolved from data.** "Last place — regular
  season", "fewest total points" and "loser of the consolation bracket" are now
  read off the standings and the losers bracket instead of being argued about
  in January. "Final standings last" and write-ins stay a human call.
- **Deadlines** — a survey with `closes_at` in the past is closed automatically.

Deliberately *not* fetched: `/v1/players/nfl`. It is a 5 MB catalogue of every
player in the NFL and nothing here renders individual players.

### Linking players to Sleeper accounts

Nobody in this league uses their real name as a Sleeper handle — they're
`pdande97`, `scomeaux11`, `LyanRatin`, `veansarg`, `happihiro`. Exact-name
matching therefore links **0 of 14**, which is why linking is a commissioner
task rather than an automatic one.

The current mapping is already recorded in `db/link-sleeper.sql` (see setup
step 4). The Desk is how you change it afterwards — someone joins, someone
renames, someone finally signs up.

**Commissioner's Desk → Sleeper** lists every player with a dropdown of all
Sleeper accounts and, where it can, a suggested match labelled *strong*,
*likely* or *weak*. The suggester (`src/lib/sleeperMatch.ts`) knows the shapes
handles usually take — `first+last`, `initial+last`, `first+initial`, a
truncated surname, a trailing birth year, a transposition — and gets about
eight of the fourteen. The rest you pick yourself.

Nothing is ever applied automatically, at any confidence. A wrong link silently
credits one player's results to another, which is worse than no link at all.
`sleeper_user_id` is `UNIQUE`, so attaching one account to two players fails
loudly with a `409` instead of quietly.

Note there are 13 Sleeper accounts against 14 roster slots — one person hasn't
joined the league yet.

---

## Setup

### 1. Create the database

```bash
npm install
npx wrangler d1 create dickheads-league
```

Paste the returned `database_id` into **both** `wrangler.toml` and
`workers/sleeper-sync/wrangler.toml`.

### 2. Set the secret

```bash
npx wrangler secret put COMMISH_PIN
```

Pick a **new** PIN. The old one (`7531`) is burned: it was published in the old
README, shipped to every browser in `league.js`, and is permanent in git
history. This one is a Worker secret — it never reaches the browser, and the
server compares it in constant time behind a rate limit.

### 3. Point it at your Sleeper league

Set `SLEEPER_LEAGUE_ID` in both `wrangler.toml` files. It is a public,
read-only id, not a secret. Everything works without it; you just get no
standings and no auto-resolved victim.

### 4. Migrate, seed and link

```bash
npm run db:apply:remote
npm run db:seed:remote
npm run db:link:remote   # attaches players to their Sleeper accounts
```

`db/link-sleeper.sql` is the hand-checked mapping of roster player → Sleeper
account, verified against the live league: every handle is a current member and
every `sleeper_roster_id` is genuinely owned by that account. It is idempotent,
so re-running is safe. David Moton has no Sleeper account and is deliberately
left unlinked; roster 14 has no owner.

Use the same commands with `:local` when working locally.

### 5. Deploy

```bash
npm run deploy        # the app
npm run deploy:sync   # the cron worker
```

Then set `NEW_ORIGIN` in `docs/_redirect.js` to the deployed URL, and point
GitHub Pages at **main / docs** so the old links keep working.

---

## Local development

```bash
npm run db:apply:local
npm run db:seed:local
cp .dev.vars.example .dev.vars     # sets a local COMMISH_PIN
npm run dev
```

`npm run dev` runs inside workerd via the Cloudflare Vite plugin, so
`platform.env.DB` in development is a real local D1 database — the same code
path as production, not a stub.

```bash
npm run check     # typecheck (0 errors, 0 warnings)
npm test          # 84 unit tests, ~1s
npm run test:e2e  # 31 end-to-end tests against the real production bundle
npm run test:all  # both
npm run build
node scripts/make-og.mjs   # regenerate the link-preview image and icon
```

---

## Old links

Every URL the league already has keeps working. `docs/` holds redirect stubs
served by GitHub Pages at the old address, and they forward to the new site.

They are a script rather than a `<meta refresh>` for one specific reason: the
boards were deep-linked by **hash** (`…/boards.html#rivalry`), the hash is never
sent to a server, and a meta refresh drops it. `tests/unit/redirects.test.ts`
runs the actual shipped file against a stubbed browser and asserts every old
path — including each board hash — lands in the right place.

The old root served Survey 1 directly. It now lands on the hub, which lists
intake with its live status: one extra tap, but the link still makes sense
after the survey closes instead of dead-ending on a locked form. That also
removes the need for the "September swap" the old README planned.

---

## The trust model

**Anyone can pick anyone's name.** That is deliberate — a login wall would kill
participation in a 14-person friends' league. It does mean the server cannot
verify *who* is writing, so it is strict about everything else:

- **Same origin only.** Site and API share an origin, so every mutation is
  checked against `Sec-Fetch-Site` / `Origin`. The old backend had to send JSON
  as `text/plain` to dodge CORS preflight, which made every write forgeable
  from any page on the internet.
- **Rate limited**, per IP and per player. PIN attempts get a much tighter
  bucket — a 4-digit PIN is only 10,000 guesses against an unthrottled endpoint.
- **Validated against the survey's own definition** before anything is written.
  Unknown questions are dropped, not stored.
- **Status checked inside the write**, as above.
- **Pairing membership enforced in SQL**, so you cannot write your rival's side
  of a negotiation even by asking for it directly.

Everything a board shows is public and never expires. That is the point of the
boards.

**The commissioner** is a PIN exchanged for an httpOnly, `SameSite=Strict`
session cookie. Every desk action is written to `audit_log`, so who closed what
and who forced which ruling is answerable.

---

## What changed from the old site

The previous implementation is preserved in `legacy/`. It worked, and several
of its ideas were good enough to keep verbatim — the lifecycle model, the
negotiation mechanic, and most of the copy. These are the things that were
actually broken:

| Then | Now |
|---|---|
| `meta:status` read-modify-written in the browser; two Desk tabs silently reverted each other | one `UPDATE`, no blob to clobber |
| `r.json().catch(() => ({ ok: true }))` — a failed write reported as saved | real `4xx`/`5xx`, surfaced honestly |
| Any key not matching a known prefix was accepted, unthrottled, from anywhere | allow-listed, validated, rate-limited, same-origin |
| PIN published in the README, in `league.js`, and in git history | a Worker secret |
| `jsStr()` didn't escape `"`, and its output went into `onclick="…"` with player-written text | no path builds markup from data |
| Responses keyed by display name, so renaming anyone orphaned their data | stable `player.id`; names are just labels |
| Ballot option ids derived from option text, so editing a punishment invalidated every ranking pointing at it | stable ids, de-duplication by constraint |
| Three hardcoded dispatch sites; a third survey showed `0/14` forever and rendered the wrong Desk tab | one registry, no survey id switched on anywhere |
| Both required ranking steps were pointer-only, and the PIN pad had no keyboard path — Survey 1 could not be completed without a mouse | real buttons, arrow-key reordering, live announcements, typable PIN |
| No OG tags, so every board link pasted into Sleeper unfurled as a bare URL | per-board title, description and image |
| Every request re-scanned the whole sheet, 2–3× | indexed SQL |
| No tests in CI, no CI | 84 unit + 31 end-to-end tests, typecheck and build on every push |
| No audit trail | `audit_log` |
| No dark mode, two never-merged 480px breakpoints, nothing above 640px | token-based theming, dark mode, a real desktop layout |
