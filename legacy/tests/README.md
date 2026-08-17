# Tests

Three Playwright suites, 125 checks. They run the pages straight off disk over
`file://` and stub the network, so nothing touches your real Google Sheet.

```bash
cd tests
npm install
npm test
```

| Suite | What it proves |
|---|---|
| **`test-architecture.js`** | The survey lifecycle end to end: close → the server rejects the write → reopen → nothing lost. Plus archive, draft, the hub, all three boards, the desk, force rulings and PIN gating. |
| **`test-rivalry.js`** | Survey 2 negotiation: open visibility, mutual agreement, case- and whitespace-insensitive matching, third options, reopen, write-ins joining the ballot, HTML escaping. |
| **`test-migration.js`** | That refactoring the live form onto `league.js` changed nothing. Needs one extra file — see below. |

## `gas-sandbox.js`

Loads the **real `Code.gs`** into a Node VM with a stubbed Sheet, so the suites
exercise the actual backend — status gating, PIN checks, prefix filtering —
rather than a re-implementation that could drift from it.

## Running `test-migration.js`

It diffs the current `index.html` against the pre-refactor single-file version,
which now only exists in git history. Recover it first:

```bash
git log --oneline -- index.html
git show <commit-before-the-refactor>:index.html > tests/original.html
```

The suite syncs the current `ROSTER` into that copy before comparing, so an
intentional roster change doesn't register as a regression.

## When to re-run

After editing `league.js` — especially `ROSTER` or `RIVAL_PAIRS`. The suites
catch a misspelled name, someone in two pairings, and anyone left unpaired.
