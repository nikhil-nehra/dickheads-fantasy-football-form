// DIFFERENTIAL TEST — runs the identical interaction script against the
// pristine live index.html and the migrated one, then diffs what came out.
// If the payload and the rendered form card match, the migration is safe.
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const ROOT = require('path').resolve(__dirname, '..');   // repo root

const ORIGINAL = 'file://' + path.resolve(ROOT + '/tests/original.tmp.html');
const MIGRATED = 'file://' + path.resolve(ROOT + '/index.html');

const fails = [];
const check = (l, c, e) => { console.log(`${c ? '  PASS' : '  FAIL'}  ${l}${!c && e ? '\n        → ' + e : ''}`); if (!c) fails.push(l); };

async function run(url, label) {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 430, height: 950 } });
  const store = new Map();
  const posts = [];
  await ctx.route('**script.google.com/**', async route => {
    const r = route.request(), u = new URL(r.url());
    if (r.method() === 'POST') {
      const b = JSON.parse(r.postData());
      posts.push(b); store.set(b.key, b.value);
      return route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
    }
    if (u.searchParams.get('action') === 'status')
      return route.fulfill({ status: 200, contentType: 'application/json', body: '{"status":{}}' });
    if (u.searchParams.get('action') === 'get')
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ value: store.get(u.searchParams.get('key')) || null }) });
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ responses: [...store.values()], status: {} }) });
  });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(String(e)));
  p.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });

  await p.goto(url);
  await p.waitForTimeout(700);

  const snap = {};

  // ── identical interaction script on both builds ──
  await p.selectOption('#nameSelect', 'Ryan Latin');
  await p.waitForTimeout(250);
  await p.locator('.chip', { hasText: '$50' }).click();
  await p.locator('#punishmentInput').fill('Loser has to caddy for the winner in a full tuxedo');
  await p.locator('.chip-sm', { hasText: 'Out of town' }).click();
  await p.waitForTimeout(250);
  snap.weekendRows = await p.locator('.wk-row').count();

  // drag weekend 1 below weekend 3 (the riskiest migrated code)
  const handles = p.locator('.wk-row .drag-handle');
  const h0 = await handles.nth(0).boundingBox();
  const h2 = await handles.nth(2).boundingBox();
  await p.mouse.move(h0.x + h0.width / 2, h0.y + h0.height / 2);
  await p.mouse.down();
  for (let i = 1; i <= 10; i++) {
    await p.mouse.move(h0.x + h0.width / 2, h0.y + h0.height / 2 + (h2.y - h0.y) * i / 10);
    await p.waitForTimeout(20);
  }
  await p.mouse.up();
  await p.waitForTimeout(450);
  snap.weekendOrderAfterDrag = await p.locator('.wk-row').evaluateAll(rs => rs.map(r => r.getAttribute('data-id')));

  // per-day unavailability
  await p.locator('.unavail-btn').first().click();
  await p.waitForTimeout(200);
  await p.locator('.day-chip').first().click();
  await p.waitForTimeout(200);
  snap.cantSummary = await p.locator('.wk-label .sub').first().innerText();

  // out-of-towner in-person / virtual
  await p.locator('.oot-controls .chip-sm', { hasText: 'Virtual' }).first().click();
  await p.waitForTimeout(200);

  // beef drag — must be on screen first, the list sits well below the fold
  const bh = p.locator('.beef-row .drag-handle');
  await bh.nth(0).scrollIntoViewIfNeeded();
  await p.waitForTimeout(200);
  const b0 = await bh.nth(0).boundingBox();
  const b3 = await bh.nth(3).boundingBox();
  await p.mouse.move(b0.x + b0.width / 2, b0.y + b0.height / 2);
  await p.mouse.down();
  for (let i = 1; i <= 10; i++) {
    await p.mouse.move(b0.x + b0.width / 2, b0.y + b0.height / 2 + (b3.y - b0.y) * i / 10);
    await p.waitForTimeout(20);
  }
  await p.mouse.up();
  await p.waitForTimeout(450);
  snap.beefOrder = await p.locator('.beef-row').evaluateAll(rs => rs.map(r => r.getAttribute('data-id')));

  // prize builder
  await p.locator('.places-count .step').nth(1).click();   // places 4 -> 5
  await p.waitForTimeout(200);
  snap.placeCount = await p.locator('.places-count .count').innerText();
  await p.locator('.reg-toggle').click();                  // toggle reg-season cut
  await p.waitForTimeout(200);
  snap.prizeTotalText = await p.locator('.prize-total').innerText();
  await p.locator('.reg-toggle').click();                  // back on
  await p.waitForTimeout(200);
  snap.prizeRows = await p.locator('.prize-row').allInnerTexts();
  snap.meter = await p.locator('.prize-total').innerText();
  snap.submitEnabled = await p.locator('.lock-btn').isEnabled();
  snap.hint = await p.locator('.submit-hint').innerText().catch(() => '');

  // the whole rendered form, normalised — structural equivalence
  snap.cardHtml = (await p.locator('main .card').innerHTML())
    .replace(/\s+/g, ' ').trim();

  // submit
  await p.locator('.lock-btn').click();
  await p.waitForTimeout(600);
  snap.successText = await p.locator('.success-card h2').innerText().catch(() => '(no success card)');

  snap.payload = posts.length ? JSON.parse(posts[posts.length - 1].value) : null;
  if (snap.payload) delete snap.payload.submittedAt;   // timestamps differ by design
  snap.postKey = posts.length ? posts[posts.length - 1].key : null;
  snap.errs = errs;

  await browser.close();
  return snap;
}

(async () => {
  // The roster changed (Pranav -> Samay, Mattew -> Matthew) after this test was
  // written. Sync it into the pristine copy so the diff isolates the CODE
  // migration rather than flagging an intentional config change.
  const leagueJs = fs.readFileSync(ROOT + '/league.js', 'utf8');
  const newRoster = leagueJs.match(/var ROSTER = \[[\s\S]*?\];/)[0].replace('var ROSTER', 'const ROSTER');
  const PRISTINE = ROOT + '/tests/original.html';
  if (!fs.existsSync(PRISTINE)) {
    console.error('\nMissing tests/original.html — the PRE-refactor single-file form.\n' +
      'Recover it from git history, e.g.:\n' +
      '  git log --oneline -- index.html\n' +
      '  git show <commit-before-the-refactor>:index.html > tests/original.html\n');
    process.exit(2);
  }
  let pristine = fs.readFileSync(PRISTINE, 'utf8');
  pristine = pristine.replace(/const ROSTER = \[[\s\S]*?\];/, newRoster);
  if (!pristine.includes('Samay Mohapatra')) throw new Error('roster sync into original.html failed');
  fs.writeFileSync(ROOT + '/tests/original.tmp.html', pristine);

  console.log('\n[running the identical interaction script against both builds]');
  const a = await run(ORIGINAL, 'original');
  const b = await run(MIGRATED, 'migrated');

  console.log('\n[A] The submitted payload');
  check('POST key identical', a.postKey === b.postKey, `${a.postKey} vs ${b.postKey}`);
  check('payload byte-identical', JSON.stringify(a.payload) === JSON.stringify(b.payload),
    'original: ' + JSON.stringify(a.payload) + '\n        migrated: ' + JSON.stringify(b.payload));
  check('payload is actually populated', a.payload && a.payload.buyIn === '$50' && a.payload.locality === 'oot');

  console.log('\n[B] Interactive behaviour');
  check('weekend drag reorders identically',
    JSON.stringify(a.weekendOrderAfterDrag) === JSON.stringify(b.weekendOrderAfterDrag),
    `${a.weekendOrderAfterDrag} vs ${b.weekendOrderAfterDrag}`);
  check('weekend drag actually moved something',
    JSON.stringify(a.weekendOrderAfterDrag) !== JSON.stringify(['w1', 'w2', 'w3']),
    'order unchanged: ' + a.weekendOrderAfterDrag);
  check('beef drag reorders identically', JSON.stringify(a.beefOrder) === JSON.stringify(b.beefOrder));
  check('beef drag actually moved something', a.beefOrder[0] !== 'Nikhil Nehra', a.beefOrder.slice(0, 3).join(', '));
  check('per-day unavailability identical', a.cantSummary === b.cantSummary, `${a.cantSummary} vs ${b.cantSummary}`);
  check('place stepper identical', a.placeCount === b.placeCount);
  check('reg-season toggle identical', a.prizeTotalText === b.prizeTotalText, `${a.prizeTotalText} vs ${b.prizeTotalText}`);
  check('prize rows identical', JSON.stringify(a.prizeRows) === JSON.stringify(b.prizeRows));
  check('prize meter identical', a.meter === b.meter);
  check('submit gating identical', a.submitEnabled === b.submitEnabled);
  check('success screen identical', a.successText === b.successText, `${a.successText} vs ${b.successText}`);

  console.log('\n[C] Rendered markup');
  if (a.cardHtml !== b.cardHtml) {
    const la = a.cardHtml, lb = b.cardHtml;
    let i = 0; while (i < la.length && la[i] === lb[i]) i++;
    check('form card markup identical', false,
      `first difference at char ${i}:\n        original: …${la.slice(Math.max(0, i - 70), i + 70)}…\n        migrated: …${lb.slice(Math.max(0, i - 70), i + 70)}…`);
  } else check('form card markup identical', true);

  console.log('\n[D] Errors');
  check('no JS errors in original', a.errs.length === 0, a.errs.join(' | '));
  check('no JS errors in migrated', b.errs.length === 0, b.errs.join(' | '));

  console.log('\n' + (fails.length ? `✗ ${fails.length} DIFFERENCE(S):\n  - ` + fails.join('\n  - ') : '✓ MIGRATED FORM IS BEHAVIOURALLY IDENTICAL'));
  process.exit(fails.length ? 1 : 0);
})();
