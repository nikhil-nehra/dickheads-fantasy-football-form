# The Dickhead's Fantasy Football Form

A single self-contained web form for running a fantasy league's pre-season intake — buy-in, punishments, draft availability, rivalries, and a prize-pool split — with a private, PIN-protected commissioner's results view. It's one `index.html` file, hosted free on GitHub Pages, with responses saved to a Google Sheet you own.

**Live site:** https://nikhil-nehra.github.io/dickheads-fantasy-football-form/

---

## Quick reference

| Thing | Value |
|---|---|
| Commissioner PIN | **7531** |
| League size | 14 players |
| Draft weekends offered | Aug 21–23, Aug 28–30, Sep 4–7 (Fri–Sun, + Mon Sep 7 Labor Day) |
| Default prize split | 1st 50% · 2nd 25% · 3rd 10% · 4th 5% · reg-season leader 10% |
| Backend | Google Sheet via Apps Script web app (free) |
| Where to change these | see [Editing the form](#editing-the-form) below |

---

## How it works

The form is pure front-end HTML/CSS/JS. It has no server of its own. When someone submits, the page sends their answers to a **Google Apps Script web app** you deploy, which stores one row per player in a **Google Sheet**. The commissioner's view reads those rows back and aggregates them live. Because everything talks to that one Sheet, anyone can fill out the form from any device — no Claude account, no login.

The connection is a single line in `index.html`:

```js
const API_URL = 'https://script.google.com/macros/s/.../exec';
```

If that URL is missing or wrong, the form still loads and runs, but nothing saves.

---

## Backend setup

Do this once. ~5 minutes. (Already done for the live site — you only need this if you're setting up a fresh copy or the Sheet changed.)

### 1. Create the Sheet + script

1. Go to [sheets.new](https://sheets.new) and make a blank Google Sheet (name it anything). You don't need to add columns — the script builds them.
2. In the Sheet: **Extensions → Apps Script**. A code editor opens.
3. Delete whatever's in `Code.gs`, then paste the entire contents of **`Code.gs`** from this repo.
4. Click **Save** (💾).

### 2. Deploy it as a web app

1. **Deploy → New deployment**.
2. Gear ⚙️ next to "Select type" → **Web app**.
3. Set:
   - **Execute as:** **Me**
   - **Who has access:** **Anyone**  ← must be "Anyone", *not* "Anyone with Google account"
4. **Deploy**, then **Authorize access** → pick your account → on the "unverified app" warning click **Advanced → Go to (project) → Allow**.
5. Copy the **Web app URL** (looks like `https://script.google.com/macros/s/AKfy…/exec`).

### 3. Paste the URL into the form

In `index.html`, near the top, replace the placeholder:

```js
const API_URL = 'https://script.google.com/macros/s/AKfy…/exec';
```

Save the file.

> **Re-deploying after editing `Code.gs`:** use **Deploy → Manage deployments → (edit ✏️) → Version: New version → Deploy**. This keeps the *same* URL. Only "New deployment" makes a new URL (which would mean re-pasting it into the HTML).

---

## Publishing to GitHub Pages

1. Commit and push `index.html` to the repo.
2. **Settings → Pages → Deploy from branch → `main` → `/root`**.
3. The form goes live at `https://<username>.github.io/<repo>/` (the live link is at the top of this file).

**To push any later change** (new dates, players, copy, PIN), just commit and push `index.html` again — the URL stays the same, so links you've already shared keep working. Make content changes *before* collecting real responses.

---

## Testing before you share

1. Open the live URL, fill out the form as yourself, and hit **Lock It In**.
2. Open your Google Sheet — a new row should appear in the `responses` tab.
3. On the form, tap **Commissioner's Desk**, enter PIN **7531**, and confirm your answer shows up.

If the row lands in the Sheet and the commissioner view shows it, storage is live — share away.

---

## Sharing

Paste the live link into the group chat / text / Slack. Anyone can open and fill it out without an account. Each submission is keyed to the chosen name, so there's **one entry per person** — resubmitting overwrites the old answer rather than duplicating it (the form makes you confirm the overwrite).

---

## What the form asks

1. **Starting Lineup** — pick your name from the roster. Your pick drives the rest of the form (e.g. it removes you from your own rivalry ranking).
2. **1st Down — Buy-in:** tap one — $25 / $50 / $100.
3. **2nd Down — Punishment idea:** free text; the league votes on the winner later.
4. **3rd Down — Draft availability:** first pick **In town (Dallas)** or **Out of town**, then drag the weekends by the ⠿ handle to rank them. Hit **"Can't make it?"** on any weekend to mark specific days (or the whole weekend) unavailable. Out-of-towners also mark in-person vs. virtual per weekend.
5. **4th Down — Rivalry Selection:** drag to rank the roster by beef, most at the top (for rivalry week, the last week of the season).
6. **Overtime (optional) — Prize pool split:** a dynamic builder — see below.

### The prize-pool builder (Q5)

- Choose **how many places pay out** with the − / + stepper (1–6). Picking a count loads a sensible starting split.
- Fine-tune each place's cut with its own − / + stepper (5% steps).
- Toggle the **regular-season points leader** switch to carve them a slice of the pot.
- A live meter keeps you honest — the split must total **100%** (steppers won't let you go over; the meter shows what's left). If your buy-in is set, each line shows the **live dollar amount** it would pay.
- Default: 1st 50% · 2nd 25% · 3rd 10% · 4th 5% · reg-season leader 10%. There's also a **"No preference — commissioner decides"** checkbox.

### Submit button

The **Lock It In** button stays greyed out until every required question is answered *and* the prize split totals 100% (unless "no preference" is checked). A small hint under the button says exactly what's still missing.

---

## The roster

Nikhil Nehra, Ryan Latin, Lyon Burns, Aidan Duncan, Stephen Comeaux, Jaswin Jabbal, Dhruv Nandwani, Sean Vargeese, Shishir Nambi, Mattew Yoshida, Pranav Chelat, Prabhas Dande, David Moton, Rayyan Ali.

---

## Commissioner's Desk (viewing responses)

1. Open the link → tap **Commissioner's Desk** (top-right).
2. Enter **7531** on the keypad.
3. You'll see a live tally: response count + who's still missing, the buy-in vote, the crowdsourced prize-split average (avg % and dollars per place, plus how many want a reg-season cut), all punishment ideas, weekends ranked with a per-day availability breakdown, and the rivalry leaderboard.
4. Reopen and re-enter the PIN anytime to refresh as more people submit.

---

## Editing the form

Everything configurable lives near the top of the `<script>` in `index.html`:

- **PIN** — search for `7531`.
- **Roster** — the `ROSTER` array.
- **Draft weekends/dates** — the `WEEKENDS` array.
- **Buy-in options** — the `BUYINS` array.
- **Default prize split** — `DEFAULT_PLACES` and `DEFAULT_REG_SEASON`.
- **Backend URL** — `API_URL`.

After editing, commit and push to update the live site.

---

## Cautions

- **The PIN is a soft lock.** 7531 keeps the casual group out, but anyone who "views source" can find it. Fine for a friends' league; not real security.
- **The public link has no password** on the form itself and never expires — anyone with the link can open it.
- **"Who has access" must be "Anyone"** on the Apps Script deployment, or people without a Google login can't submit.
- **Your data stays in your Google Sheet.** You can read, sort, or export it directly anytime.
- **If nothing saves:** open the browser console on the live page (F12) and look for a red error — usually the `API_URL` is wrong or the deployment's access level isn't "Anyone".

---

## Files in this repo

- **`index.html`** — the entire form + commissioner view (self-contained).
- **`Code.gs`** — the Google Apps Script backend to paste into your Sheet's Apps Script editor.
- **`README.md`** — this file.
