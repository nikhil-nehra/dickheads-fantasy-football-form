/**
 * The Dickhead's Fantasy Football Form — Google Apps Script backend
 * ------------------------------------------------------------------
 * Stores one row per player in a Google Sheet and serves the
 * commissioner's results view. Paste this into a Google Sheet's
 * Apps Script editor and deploy it as a Web App.
 *   Full setup walkthrough: README.md → "Backend setup".
 *
 * HOW IT ALL CONNECTS (you don't configure a sheet name/ID anywhere):
 *   1. The FORM finds this SCRIPT via the deployed Web App URL, which you
 *      paste into index.html as `const API_URL = '.../exec'`. That URL is
 *      the only wiring between the two.
 *   2. This SCRIPT finds your SPREADSHEET automatically because it is
 *      "container-bound" — it was created from Extensions -> Apps Script
 *      INSIDE your Sheet, so getActiveSpreadsheet() always returns that
 *      exact Sheet. Nothing to paste, no ID to copy.
 *
 * Sheet columns (row 1 headers, created automatically): key | value | updatedAt
 *   key       = "response:<Player Name>"  (one row per player, overwrites on resubmit)
 *   value     = the full response as a JSON string
 *   updatedAt = ISO timestamp of the last write
 */

// The TAB (worksheet) name inside your spreadsheet where rows are written —
// NOT the spreadsheet's file name. You do NOT need to change this: if a tab
// called "responses" doesn't exist yet, _sheet() creates it automatically.
// Only rename this if you want the data written to a differently-named tab.
var SHEET_NAME = 'responses';

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

/** Reads: ?action=list  or  ?action=get&key=response:Name */
function doGet(e) {
  var action = (e && e.parameter && e.parameter.action) || 'list';
  var sh = _sheet();
  var rows = sh.getDataRange().getValues(); // includes header row

  if (action === 'get') {
    var wanted = (e.parameter.key || '');
    for (var i = 1; i < rows.length; i++) {
      if (rows[i][0] === wanted) {
        return _json({ value: rows[i][1] });
      }
    }
    return _json({ value: null });
  }

  // default: list every response value
  var out = [];
  for (var j = 1; j < rows.length; j++) {
    if (rows[j][0]) out.push(rows[j][1]);
  }
  return _json({ responses: out });
}

/** Writes: POST body = { "key": "response:Name", "value": "<json string>" } */
function doPost(e) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000); // serialize writes so two people can't collide
  try {
    var body = JSON.parse(e.postData.contents);
    var key = body.key;
    var value = body.value;
    if (!key) return _json({ ok: false, error: 'missing key' });

    var sh = _sheet();
    var rows = sh.getDataRange().getValues();
    var now = new Date().toISOString();

    // Upsert: overwrite the existing row for this key, else append.
    for (var i = 1; i < rows.length; i++) {
      if (rows[i][0] === key) {
        sh.getRange(i + 1, 2).setValue(value);     // value column
        sh.getRange(i + 1, 3).setValue(now);        // updatedAt column
        return _json({ ok: true, updated: true });
      }
    }
    sh.appendRow([key, value, now]);
    return _json({ ok: true, created: true });
  } catch (err) {
    return _json({ ok: false, error: String(err) });
  } finally {
    lock.releaseLock();
  }
}
