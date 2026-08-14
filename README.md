# The Dickhead's Fantasy Football League

A small static site for running a 14-person fantasy league: multiple surveys with a real open/closed lifecycle, permanent public result boards, and a PIN-protected commissioner's desk. Hosted free on GitHub Pages, with every response saved to a Google Sheet you own.

**Live site:** https://nikhil-nehra.github.io/dickheads-fantasy-football-form/

---

## Quick reference

| Thing | Value |
|---|---|
| Commissioner PIN | **7531** |
| League size | 14 players |
| Backend | Google Sheet via Apps Script web app (free) |
| Edit the roster / PIN / pairs / ballot | **`league.js` only** |
| Open & close surveys | Commissioner's Desk → League Control (no code, no git) |
| The link to paste in Sleeper | `…/boards.html#rivalry` |

---

## The idea in one line

**Surveys close. Boards are forever.**

A survey is a thing people fill in; it has a lifecycle and eventually stops accepting answers. A board is a permanent, public, read-only view of results that keeps working long after its survey is shut. That separation is what lets you close things down without ever breaking a link you've already shared.

---

## Files

| File | What it is |
|---|---|
| **`league.js`** | **The only file you normally edit.** Roster, PIN, backend URL, the survey registry, the punishment ballot, the rivalry pairs, and all shared logic. |
| **`league.css`** | The shared design system. Every page uses it. |
| **`hub.html`** | The league hub — every survey with its live status, plus the boards and an archive. |
| **`index.html`** | Survey 1 — pre-season intake. (Becomes `intake.html` at the September swap.) |
| **`rivalry.html`** | Survey 2 — rivalry week & the punishment. |
| **`boards.html`** | The three permanent public boards. No PIN. |
| **`desk.html`** | The Commissioner's Desk. PIN 7531. |
| **`Code.gs`** | The Apps Script backend. Paste into your Sheet's script editor. |

Everything is plain HTML/CSS/JS with no build step. Commit and push; GitHub Pages serves it.

---

## The survey lifecycle

Every survey is in exactly one of four states. You change them from **Commissioner's Desk → League Control** — no code, no git, works from your phone.

| Status | On the hub | The page | Writes |
|---|---|---|---|
| **Draft** | Hidden entirely | Loads with a preview banner | Blocked |
| **Open** | Listed, green badge | Normal | Accepted |
| **Closed** | Listed, red badge | Read-only, shows you your own saved answers | **Rejected by the server** |
| **Archived** | Tucked into the Archive section | Same as closed | Rejected |

**Reactivating is one tap.** Closing a survey never deletes anything — it only gates writes. Set it back to Open and everyone picks up exactly where they left off, with every answer intact. You can close and reopen as many times as you like.

### Closing is real, not cosmetic

The status lives in the Sheet (under `meta:status`), and `Code.gs` checks it on every write. A closed survey rejects new responses **server-side**, so it stays closed even for someone poking at the browser console. The read-only page is just the polite version of the same rule.

Two things bypass it, both requiring the PIN: the commissioner changing a status, and the commissioner forcing a rivalry ruling.

### Boards never close

The boards deliberately ignore survey status. That's what makes `…/boards.html#rivalry` safe to paste into Sleeper once and never touch again — closing or archiving Survey 2 doesn't break it.

---

## Survey 1 — Pre-Season Intake (`index.html`)

1. **Starting Lineup** — pick your name from the roster.
2. **1st Down — Buy-in:** $25 / $50 / $100.
3. **2nd Down — Punishment idea:** free text. These auto-populate the Survey 2 ballot.
4. **3rd Down — Draft availability:** pick in-town or out-of-town, then drag the weekends by the ⠿ handle to rank them. **"Can't make it?"** marks specific days unavailable. Out-of-towners also mark in-person vs. virtual per weekend.
5. **4th Down — Rivalry Selection:** drag to rank the roster by beef.
6. **Overtime (optional) — Prize pool split:** choose how many places pay out, tune each cut in 5% steps, optionally carve out a regular-season leader's cut. A live meter enforces 100%, and shows live dollar amounts against your buy-in.

**Lock It In** stays greyed out until everything required is answered and the split totals 100%, with a hint saying what's missing. One entry per person — resubmitting overwrites, with a confirmation.

---

## Survey 2 — Rivalry Week & The Punishment (`rivalry.html`)

**1st Down — the punishment.** Rank your **top 3** from a shared ballot (3/2/1 points). The ballot is your official shortlist first, then every Survey 1 punishment idea, auto-pulled and de-duplicated with credit to whoever suggested it. Write-ins join the ballot for everyone once saved.

**2nd Down — the victim.** One vote on who serves it: reg-season last, toilet-bowl loser, final-standings last, fewest points, or both. Write-ins allowed.

**3rd Down — rivalry week.** You and your assigned rival negotiate three things: the **rivalry name**, the **set bet**, and the **side punishment**.

### How the negotiation works

Everything is open — you see your rival's proposals as soon as they save, and they see yours. For each line you back one of:

- **Your proposal**
- **Your rival's proposal**
- **A third option** you type yourself

Then hit **Lock in my pick**.

**A line only locks when you both pick the same thing.** Until then it shows exactly where you each stand — *"You're backing X, Ryan is backing Y. One of you has to blink."* The moment your picks match it stamps **AGREED** and lands on the Rivalry Board. Matching ignores case and spacing, so "loser buys dinner" and "Loser Buys Dinner" count as agreement.

There's no race and nobody can lock the other out: **each player only ever writes their own row**, and "agreed" is computed by comparing the two. Either side can **Reopen this line** to reneg.

If a pair stalls, the commissioner can **force a ruling** from the Desk. That overrides both picks and shows as *COMMISSIONER'S RULING* on their page and the board, and can be withdrawn to hand the decision back.

The page auto-refreshes every 15 seconds so you see your rival's moves without reloading.

---

## The boards (`boards.html`)

Three deep-linkable public tabs, no PIN:

- **`#rivalry` — The Rivalry Board.** Every agreed rivalry name, bet and side punishment, with badges for agreed / ruled / in dispute / not set.
- **`#draft` — Draft Day.** Weekends ranked by preference with a per-day availability breakdown, the single best date, who's coming in person vs. virtual, and who still hasn't answered.
- **`#pot` — The Pot.** The winning buy-in, total pot, and the crowdsourced average prize split in real dollars per place.

> **Why not post straight into Sleeper?** You can't. Sleeper's API is read-only — *"No API Token is necessary, as you cannot modify contents via this API."* There's no endpoint for chat messages, polls, or league notes. Paste `…/boards.html#rivalry` into league chat once; Sleeper renders the link and the page stays current forever. There's a **Copy link for Sleeper** button on every board.

---

## Commissioner's Desk (`desk.html`)

PIN **7531**, entered once. Tabs:

- **League Control** — open / close / archive / reactivate every survey, plus setup warnings (empty `RIVAL_PAIRS`, misspelled names, anyone in two pairings).
- **Intake** — turnout and who's missing, buy-in vote, all punishment ideas, weekends ranked, suggested rivalry pairings (with a **Copy as `RIVAL_PAIRS` code** button that hands you the exact block to paste into `league.js`), and every individual response expandable in full.
- **Rivalry Week** — turnout, the ranked-choice punishment tally with "firsts" as a tiebreak, the who-takes-it tally with write-ins, and every pairing expandable to show **both sides' proposals and both sides' current picks**, with a **Force** box on any un-agreed line.

---

## Configuring everything (`league.js`)

One file. It's commented throughout.

| Setting | What it does |
|---|---|
| `API_URL` | The deployed Apps Script Web App URL. |
| `COMMISH_PIN` | The 4-digit code. Must match `COMMISH_PIN` in `Code.gs`. |
| `ROSTER` | The 14 players. Add someone here and they appear everywhere. |
| `SURVEYS` | The survey registry — id, file, title, blurb, key prefix. |
| `BOARDS` | The permanent boards. |
| `WEEKENDS`, `BUYINS` | Survey 1 options. |
| `DEFAULT_PLACES`, `PLACE_TEMPLATES` | Prize-split defaults. |
| `COMMISSIONER_PUNISHMENTS` | **Your official punishment shortlist.** One quoted string per line. |
| `INCLUDE_SURVEY1_IDEAS` | Also pull Survey 1's free-text ideas onto the ballot. |
| `PUNISHMENT_TARGETS` | The "who takes it" options. |
| `RIVAL_PAIRS` | **The 7 pairings.** |
| `NEG_FIELDS` | What each pair negotiates — add a fourth and it appears everywhere automatically. |

### The roster

Nikhil Nehra · Ryan Latin · Lyon Burns · Aidan Duncan · Stephen Comeaux · Jaswin Jabbal · Dhruv Nandwani · Sean Vargeese · Shishir Nambi · Matthew Yoshida · Samay Mohapatra · Prabhas Dande · David Moton · Rayyan Ali

### The rivalry pairs

```js
var RIVAL_PAIRS = [
  ['Nikhil Nehra',    'Sean Vargeese'],
  ['Shishir Nambi',   'Aidan Duncan'],
  ['Stephen Comeaux', 'David Moton'],
  ['Lyon Burns',      'Matthew Yoshida'],
  ['Jaswin Jabbal',   'Dhruv Nandwani'],
  ['Ryan Latin',      'Rayyan Ali'],
  ['Prabhas Dande',   'Samay Mohapatra'],
];
```

If this is ever emptied, everything **falls back to auto-pairing** from the Survey 1 beef rankings so nothing breaks — but the Desk warns you, because auto pairs re-shuffle as late responses land. The Desk's **Copy as `RIVAL_PAIRS` code** button regenerates the block from current suggestions.

### Roster changes and orphaned rows

Responses are keyed by name, so removing or renaming someone strands their row in the Sheet. Anything whose name isn't in `ROSTER` is **excluded from every count, tally and board** so the numbers stay honest — and listed on the Desk's League Control tab under **Off the roster**, so it can never disappear silently. Delete the row in the Sheet when you want it gone for good.

Two changes made on 14 Aug: `Pranav Chelat` → `Samay Mohapatra`, and the `Mattew Yoshida` spelling corrected to `Matthew Yoshida`.

> **One manual step:** Pranav had already submitted Survey 1. His `response:Pranav Chelat` row is still in the Sheet — delete it there. Until you do, he's simply filtered out of everything and flagged on the Desk.

### Adding a whole new survey

1. Copy `rivalry.html` as a starting point.
2. Add an entry to `SURVEYS` in `league.js` with a unique `id` and `keyPrefix`.
3. Add that prefix to `KEY_OWNER` in `Code.gs` and redeploy.

It then appears on the hub, in the Desk's tabs, and in the open/close controls automatically.

---

## The September swap

Right now the root URL serves Survey 1, because that's the link the league already has and the draft is live. Once the draft is done and intake is closed:

1. Rename `index.html` → `intake.html`
2. Rename `hub.html` → `index.html`
3. In `league.js`, change the intake `file` from `'index.html'` to `'intake.html'`

That's it. The root URL everyone already has becomes the hub, and every other link keeps working. There's a reminder comment above `SURVEYS` in `league.js`.

---

## Backend setup

Only needed for a fresh copy — the live site is already wired up.

### 1. Create the Sheet + script

1. Go to [sheets.new](https://sheets.new) and make a blank Google Sheet. No columns needed — the script builds them.
2. **Extensions → Apps Script**.
3. Delete what's in `Code.gs` and paste the entire contents of **`Code.gs`** from this repo.
4. **Save**.

### 2. Deploy it as a web app

1. **Deploy → New deployment**.
2. Gear ⚙️ next to "Select type" → **Web app**.
3. Set **Execute as: Me** and **Who has access: Anyone** ← must be "Anyone", *not* "Anyone with Google account".
4. **Deploy**, then **Authorize access** → your account → **Advanced → Go to (project) → Allow**.
5. Copy the **Web app URL** and paste it into `API_URL` in `league.js`.

### Updating `Code.gs` later

**Deploy → Manage deployments → (edit ✏️) → Version: New version → Deploy.** This keeps the **same URL**, so nothing needs re-pasting. Only "New deployment" mints a new URL.

> **Upgrading from the old single-survey backend:** paste the new `Code.gs` over the old one and redeploy as a new version. Existing rows are untouched and keep working — `?action=list` with no prefix still returns everything, exactly as before.

### How the data is stored

One flat `responses` tab, `key | value | updatedAt`, namespaced by key:

| Key | What |
|---|---|
| `response:<Player Name>` | Survey 1 |
| `s2:<Player Name>` | Survey 2 |
| `s2force:<A>::<B>` | Commissioner's ruling on a pairing |
| `meta:status` | Every survey's open/closed state |

Pages request only the prefixes they need (`?action=list&prefix=s2:`), so nobody downloads the whole league's history on every poll.

---

## Cautions

- **The PIN is a soft lock.** It keeps the casual group out; anyone who views source can find it. It *is* checked server-side for status changes and rulings, so it's not purely decorative — but it isn't real security.
- **Name dropdowns have no password.** Anyone could pick someone else's name. Fine for a friends' league; know that it's the trust model.
- **The boards and every survey link are fully public** and never expire.
- **`Who has access` must be `Anyone`** on the Apps Script deployment, or people without a Google login can't submit.
- **Don't change `RIVAL_PAIRS` after people start negotiating** — re-pairing mid-flight orphans the picks both players already made.
- **Your data stays in your Google Sheet.** Read, sort or export it any time.
- **If nothing saves:** open the browser console (F12) on the live page. Usually `API_URL` is wrong, the deployment's access level isn't "Anyone", or the survey is closed (you'll see `survey_closed`).
