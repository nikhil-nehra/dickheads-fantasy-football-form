// Runs the REAL Code.gs in-process against an in-memory sheet, so the browser
// tests exercise the actual backend logic (status gating, PIN checks, prefix
// filtering) rather than a re-implementation that could drift from it.
const fs = require('fs');
const vm = require('vm');
const ROOT = require('path').resolve(__dirname, '..');   // repo root

function makeBackend() {
  const rows = [['key', 'value', 'updatedAt']];

  const sheet = {
    appendRow: r => rows.push(r.slice()),
    getDataRange: () => ({ getValues: () => rows.map(r => r.slice()) }),
    getRange: (r, c) => ({
      setValue: v => {
        while (rows.length < r) rows.push(['', '', '']);
        rows[r - 1][c - 1] = v;
      }
    })
  };

  const sandbox = {
    SpreadsheetApp: {
      getActiveSpreadsheet: () => ({
        getSheetByName: n => (n === 'responses' ? sheet : null),
        insertSheet: () => sheet
      })
    },
    ContentService: {
      MimeType: { JSON: 'application/json' },
      createTextOutput: t => ({ _t: t, setMimeType() { return this; }, getContent() { return this._t; } })
    },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    console
  };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(ROOT + '/Code.gs', 'utf8'), sandbox);

  return {
    rows,
    doGet: params => JSON.parse(sandbox.doGet({ parameter: params }).getContent()),
    doPost: body => JSON.parse(sandbox.doPost({ postData: { contents: JSON.stringify(body) } }).getContent()),
    seedRaw: (k, v) => rows.push([k, v, new Date().toISOString()])
  };
}

// Wire the sandbox into a Playwright context so the pages talk to real Code.gs.
async function attach(ctx, backend) {
  await ctx.route('**script.google.com/**', async route => {
    const req = route.request();
    const u = new URL(req.url());
    let out;
    if (req.method() === 'POST') out = backend.doPost(JSON.parse(req.postData()));
    else {
      const params = {};
      u.searchParams.forEach((v, k) => { params[k] = v; });
      out = backend.doGet(params);
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(out) });
  });
}

module.exports = { makeBackend, attach };
