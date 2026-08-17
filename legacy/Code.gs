/**
 * The Dickhead's Fantasy Football League — Google Apps Script backend
 * ═══════════════════════════════════════════════════════════════════
 * Stores one row per player per survey in a Google Sheet, and owns the
 * open/closed state of every survey in the league.
 *   Full setup walkthrough: README.md → "Backend setup".
 *
 * HOW IT ALL CONNECTS (you don't configure a sheet name/ID anywhere):
 *   1. The PAGES find this SCRIPT via the deployed Web App URL, which you
 *      paste into league.js as `API_URL`. That URL is the only wiring.
 *   2. This SCRIPT finds your SPREADSHEET automatically because it is
 *      "container-bound" — it was created from Extensions -> Apps Script
 *      INSIDE your Sheet, so getActiveSpreadsheet() always returns that
 *      exact Sheet. Nothing to paste, no ID to copy.
 *
 * Sheet columns (row 1 headers, created automatically): key | value | updatedAt
 *
 * KEY NAMESPACES — this is how one flat sheet holds many surveys:
 *   response:<Player Name>   Survey 1 (pre-season intake)
 *   s2:<Player Name>         Survey 2 (rivalry week & the punishment)
 *   s2force:<A>::<B>         commissioner's ruling on a rivalry pairing
 *   meta:status              open/closed state of every survey
 *
 * ─── UPGRADING FROM THE OLD VERSION ───────────────────────────────
 * Paste this over the old Code.gs, then:
 *     Deploy → Manage deployments → (edit ✏️) → Version: New version → Deploy
 * That keeps the SAME URL, so nothing needs re-pasting into league.js.
 * Existing rows are untouched and keep working exactly as before.
 */

var SHEET_NAME = 'responses';

/* Must match COMMISH_PIN in league.js. Used to authorise commissioner-only
   writes: changing a survey's status, and overriding a closed survey. */
var COMMISH_PIN = 'REDACTED';

/* Which survey each key namespace belongs to. Used to decide whether a write
   is allowed given that survey's current status. Anything not listed here is
   unrestricted (e.g. meta: rows, which have their own PIN check). */
var KEY_OWNER = [
  { prefix: 'response:', survey: 'intake'  },
  { prefix: 's2force:',  survey: null      },  // commissioner rulings — PIN-gated below
  { prefix: 's2:',       survey: 'rivalry' }
];

/* A survey with no stored status is treated as this. Keeps the very first
   deploy behaving exactly like the old script. */
var DEFAULT_STATUS = 'open';

/* Only 'open' accepts writes from players. */
var WRITABLE_STATUSES = ['open'];


/* ════════════════════════ PLUMBING ════════════════════════ */

function _sheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(SHEET_NAME);
    sh.appendRow(['key', 'value', 'updatedAt']);
  }
  return sh;
}

function _json(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function _rowsFor(key) {
  var sh = _sheet();
  var rows = sh.getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) {
    if (rows[i][0] === key) return { sheet: sh, index: i + 1, value: rows[i][1] };
  }
  return { sheet: sh, index: -1, value: null };
}

/** The survey a key belongs to, or null if it isn't survey-owned. */
function _surveyForKey(key) {
  for (var i = 0; i < KEY_OWNER.length; i++) {
    if (key.indexOf(KEY_OWNER[i].prefix) === 0) return KEY_OWNER[i].survey;
  }
  return null;
}

/** The whole status map: { surveyId: {status, changedAt} }. */
function _statusMap() {
  var found = _rowsFor('meta:status');
  if (found.index === -1 || !found.value) return {};
  try { return JSON.parse(found.value) || {}; } catch (err) { return {}; }
}

function _statusOf(surveyId) {
  var map = _statusMap();
  var entry = map[surveyId];
  if (!entry) return DEFAULT_STATUS;
  return (typeof entry === 'string') ? entry : (entry.status || DEFAULT_STATUS);
}


/* ════════════════════════ READS ════════════════════════ */

/**
 * ?action=list                       every row (backward compatible)
 * ?action=list&prefix=s2:            only rows whose key starts with s2:
 * ?action=list&prefix=s2:,s2force:   several prefixes, comma separated
 * ?action=get&key=response:Name      one row
 * ?action=status                     just the survey status map
 *
 * The prefix filter is what stops every page from downloading the whole
 * league's history on each poll. Always pass one from new code.
 */
function doGet(e) {
  var action = (e && e.parameter && e.parameter.action) || 'list';
  var sh = _sheet();
  var rows = sh.getDataRange().getValues(); // includes header row

  if (action === 'status') {
    return _json({ status: _statusMap() });
  }

  if (action === 'get') {
    var wanted = (e.parameter.key || '');
    for (var i = 1; i < rows.length; i++) {
      if (rows[i][0] === wanted) return _json({ value: rows[i][1] });
    }
    return _json({ value: null });
  }

  // list — optionally filtered by one or more key prefixes
  var prefixes = [];
  var raw = (e && e.parameter && e.parameter.prefix) || '';
  if (raw) {
    var parts = raw.split(',');
    for (var p = 0; p < parts.length; p++) {
      var t = parts[p].replace(/^\s+|\s+$/g, '');
      if (t) prefixes.push(t);
    }
  }

  var out = [];
  for (var j = 1; j < rows.length; j++) {
    var key = rows[j][0];
    if (!key) continue;
    if (prefixes.length) {
      var hit = false;
      for (var k = 0; k < prefixes.length; k++) {
        if (String(key).indexOf(prefixes[k]) === 0) { hit = true; break; }
      }
      if (!hit) continue;
    }
    out.push(rows[j][1]);
  }
  return _json({ responses: out, status: _statusMap() });
}


/* ════════════════════════ WRITES ════════════════════════ */

/**
 * POST body = { "key": "...", "value": "<json string>", "pin": "optional" }
 *
 * A write is rejected when the key belongs to a survey that isn't open —
 * this is the real, server-side enforcement behind "closed" surveys, so a
 * closed survey can't be written to even by someone poking at the console.
 * Passing the correct commissioner PIN overrides that.
 */
function doPost(e) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000); // serialize writes so two people can't collide
  try {
    var body = JSON.parse(e.postData.contents);
    var key = body.key;
    var value = body.value;
    var pin = String(body.pin == null ? '' : body.pin);
    if (!key) return _json({ ok: false, error: 'missing key' });

    var isCommish = (pin === COMMISH_PIN);

    // meta: rows (survey statuses) are commissioner-only, always.
    if (String(key).indexOf('meta:') === 0 && !isCommish) {
      return _json({ ok: false, error: 'forbidden', message: 'Commissioner only.' });
    }

    // Commissioner rulings on rivalries are commissioner-only, always.
    if (String(key).indexOf('s2force:') === 0 && !isCommish) {
      return _json({ ok: false, error: 'forbidden', message: 'Commissioner only.' });
    }

    // Player writes are gated on their survey being open.
    var survey = _surveyForKey(key);
    if (survey && !isCommish) {
      var st = _statusOf(survey);
      var writable = false;
      for (var w = 0; w < WRITABLE_STATUSES.length; w++) {
        if (WRITABLE_STATUSES[w] === st) { writable = true; break; }
      }
      if (!writable) {
        return _json({
          ok: false, error: 'survey_closed', survey: survey, status: st,
          message: 'That survey is ' + st + '. Responses are locked.'
        });
      }
    }

    var sh = _sheet();
    var rows = sh.getDataRange().getValues();
    var now = new Date().toISOString();

    // Upsert: overwrite the existing row for this key, else append.
    for (var i = 1; i < rows.length; i++) {
      if (rows[i][0] === key) {
        sh.getRange(i + 1, 2).setValue(value);     // value column
        sh.getRange(i + 1, 3).setValue(now);       // updatedAt column
        return _json({ ok: true, updated: true, updatedAt: now });
      }
    }
    sh.appendRow([key, value, now]);
    return _json({ ok: true, created: true, updatedAt: now });

  } catch (err) {
    return _json({ ok: false, error: String(err) });
  } finally {
    lock.releaseLock();
  }
}
