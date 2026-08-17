// Survey 2 negotiation suite, against the MIGRATED rivalry.html and the real
// Code.gs. Replaces the pre-refactor test.js, and covers the edges the broader
// architecture suite doesn't: case-insensitive agreement, reopen, third
// options, write-ins, and HTML escaping.
const { chromium } = require('playwright');
const path = require('path');
const { makeBackend, attach } = require('./gas-sandbox');
const ROOT = require('path').resolve(__dirname, '..');   // repo root

const F = f => 'file://' + path.resolve(ROOT + '/' + f);
const fails = [];
const check = (l, c, e) => { console.log(`${c ? '  PASS' : '  FAIL'}  ${l}${!c && e ? '\n        → ' + e : ''}`); if (!c) fails.push(l); };

let backend, ctx;
async function open(file, name) {
  const p = await ctx.newPage();
  p._errs = [];
  p.on('pageerror', e => p._errs.push(String(e)));
  p.on('console', m => { if (m.type() === 'error') p._errs.push('console: ' + m.text()); });
  await p.goto(F(file));
  await p.waitForTimeout(900);
  if (name) { await p.selectOption('#nameSelect', name); await p.waitForTimeout(500); }
  return p;
}
const card = (p, tag) => p.locator('.neg-card').filter({ has: p.locator('.neg-tag', { hasText: tag }) });

(async () => {
  backend = makeBackend();
  const s1 = (name, punishment) => JSON.stringify({
    name, punishment, buyIn: '$50', locality: 'local', weekendOrder: ['w1'],
    cantMake: {}, inPerson: {}, beefOrder: [], prizePlan: null, submittedAt: new Date().toISOString()
  });
  backend.seedRaw('response:Nikhil Nehra', s1('Nikhil Nehra', 'Loser gets a league-chosen tattoo'));
  backend.seedRaw('response:Sean Vargeese', s1('Sean Vargeese', 'Loser runs a 5k in a hot dog costume'));
  backend.seedRaw('response:Lyon Burns', s1('Lyon Burns', 'Loser gets a league-chosen tattoo')); // dupe -> dedupe

  const browser = await chromium.launch();
  ctx = await browser.newContext({ viewport: { width: 430, height: 950 }, deviceScaleFactor: 2 });
  await attach(ctx, backend);

  // ═══ 1. BALLOT ═══
  console.log('\n[1] The ballot');
  const A = await open('rivalry.html', 'Nikhil Nehra');
  const ballot = await A.locator('.pun-txt').allInnerTexts();
  check('Survey 1 ideas pulled onto the ballot', ballot.some(t => t.includes('hot dog costume')));
  check('duplicate ideas deduped', ballot.filter(t => t.includes('tattoo')).length === 1, `${ballot.length} options`);
  check('attribution shown', (await A.locator('.pun-src').first().innerText()).includes('Survey 1'));

  await A.locator('.pun-opt').nth(0).click();
  await A.locator('.pun-opt').nth(1).click();
  await A.waitForTimeout(200);
  check('podium fills in tap order', (await A.locator('.podium-slot').count()) === 2);
  await A.locator('.podium-x').first().click();
  await A.waitForTimeout(200);
  check('podium entries removable', (await A.locator('.podium-slot').count()) === 1);

  await A.locator('#punWrite').fill('Loser hosts next year’s draft in a clown suit');
  await A.locator('.target-opt').nth(1).click();
  await A.waitForTimeout(200);

  // ═══ 2. PAIRING ═══
  console.log('\n[2] Fixed pairing');
  check('rival is Sean, per RIVAL_PAIRS',
    (await A.locator('.vs-name').nth(1).innerText()).toLowerCase().includes('sean'));

  // ═══ 3. PROPOSE + BACK OWN ═══
  console.log('\n[3] Proposing');
  await A.locator('[data-prop="rname"]').fill('The Battle for the Last Brain Cell');
  await A.locator('[data-prop="bet"]').fill('Loser Venmos $20 and posts the receipt');
  await A.waitForTimeout(200);
  check('"your proposal" radio updates live as you type',
    (await card(A, 'RIVALRY NAME').locator('.pick-val').first().innerText()).includes('Brain Cell'));
  await card(A, 'RIVALRY NAME').locator('.pick-opt').nth(0).click();
  await A.waitForTimeout(150);
  await card(A, 'RIVALRY NAME').locator('.neg-btn:not(.undo)').click();
  await A.waitForTimeout(800);
  // also back his own bet, so step 5 produces a genuine two-sided standoff
  await card(A, 'THE SET BET').locator('.pick-opt').nth(0).click();
  await A.waitForTimeout(150);
  await card(A, 'THE SET BET').locator('.neg-btn:not(.undo)').click();
  await A.waitForTimeout(800);
  check('write-in joined the ballot for everyone',
    JSON.parse(backend.doGet({ action: 'get', key: 's2:Nikhil Nehra' }).value).punishWrite.includes('clown suit'));
  check('nothing agreed while Sean is absent', (await A.locator('.neg-status.agreed').count()) === 0);

  // ═══ 4. OPEN VISIBILITY + MUTUAL AGREEMENT ═══
  console.log('\n[4] Agreement');
  const B = await open('rivalry.html', 'Sean Vargeese');
  check("rival's proposal visible immediately",
    (await B.locator('.prop-box.theirs .prop-val').first().innerText()).includes('Brain Cell'));
  check("rival's write-in appears on Sean's ballot",
    (await B.locator('.pun-txt').allInnerTexts()).some(t => t.includes('clown suit')));

  await card(B, 'RIVALRY NAME').locator('.pick-opt').nth(1).click();
  await B.waitForTimeout(150);
  await card(B, 'RIVALRY NAME').locator('.neg-btn:not(.undo)').click();
  await B.waitForTimeout(800);
  check('matching picks lock the line', (await card(B, 'RIVALRY NAME').locator('.neg-status.agreed').count()) === 1);
  check('agreed value correct',
    (await card(B, 'RIVALRY NAME').locator('.as-val').innerText()) === 'The Battle for the Last Brain Cell');

  // ═══ 5. THIRD OPTION + CASE TOLERANCE ═══
  console.log('\n[5] Third options');
  const bet = card(B, 'THE SET BET');
  await bet.locator('.pick-opt').nth(2).click();
  await B.waitForTimeout(200);
  await bet.locator('[data-third="bet"]').fill('Loser buys dinner AND pays next year');
  await bet.locator('.neg-btn:not(.undo)').click();
  await B.waitForTimeout(800);
  check('a third option does not lock it on its own', (await card(B, 'THE SET BET').locator('.neg-status.wait').count()) === 1);
  const foot = await card(B, 'THE SET BET').locator('.neg-foot.wait').innerText();
  check('the standoff names both positions', foot.includes('Venmos') && foot.includes('next year'), foot);
  check('the standoff says who has to blink', foot.toLowerCase().includes('blink'), foot);

  await A.reload(); await A.waitForTimeout(900);
  await A.selectOption('#nameSelect', 'Nikhil Nehra'); await A.waitForTimeout(500);
  check('saved podium restored on reload', (await A.locator('.podium-slot').count()) === 1);
  check('saved proposal restored on reload', (await A.locator('[data-prop="bet"]').inputValue()).includes('Venmos'));
  check('agreed line still stamped after reload', (await card(A, 'RIVALRY NAME').locator('.as-val').count()) === 1);

  const nb = card(A, 'THE SET BET');
  await nb.locator('.pick-opt').nth(2).click();
  await A.waitForTimeout(200);
  await nb.locator('[data-third="bet"]').fill('   loser BUYS dinner and PAYS next year   ');  // case + spacing differ
  await nb.locator('.neg-btn:not(.undo)').click();
  await A.waitForTimeout(800);
  check('agreement ignores case and whitespace',
    (await card(A, 'THE SET BET').locator('.neg-status.agreed').count()) === 1);

  // ═══ 6. REOPEN ═══
  console.log('\n[6] Reopening');
  await card(A, 'THE SET BET').locator('.neg-btn.undo').click();
  await A.waitForTimeout(800);
  check('reopen unlocks the line', (await card(A, 'THE SET BET').locator('.neg-status.agreed').count()) === 0);
  check('reopen only clears MY pick, not theirs',
    (await card(A, 'THE SET BET').locator('.neg-foot.wait').innerText()).includes('next year'));

  // ═══ 7. ESCAPING ═══
  console.log('\n[7] Escaping');
  const C = await open('rivalry.html', 'Lyon Burns');
  await C.locator('[data-prop="rname"]').fill('<img src=x onerror="window.__XSS=1"><b>bold</b>');
  await C.locator('.neg-card').first().locator('.pick-opt').nth(0).click();
  await C.waitForTimeout(150);
  await C.locator('.neg-card').first().locator('.neg-btn:not(.undo)').click();
  await C.waitForTimeout(800);
  const D = await open('rivalry.html', 'Matthew Yoshida');  // Lyon's fixed rival
  const shown = await D.locator('.prop-box.theirs .prop-val').first().innerText();
  check('the new roster spelling resolves the pairing',
    (await D.locator('.vs-name').nth(1).innerText()).toLowerCase().includes('lyon'));
  check('HTML in user input is escaped, not rendered', shown.includes('<img') && shown.includes('<b>bold</b>'), shown);
  check('no XSS executed', (await D.evaluate(() => window.__XSS)) === undefined);

  console.log('\n[8] Errors');
  for (const [n, p] of [['A', A], ['B', B], ['C', C], ['D', D]]) {
    check(`no JS errors on page ${n}`, p._errs.length === 0, p._errs.slice(0, 2).join(' | '));
  }

  await browser.close();
  console.log('\n' + (fails.length ? `✗ ${fails.length} FAILED:\n  - ` + fails.join('\n  - ') : '✓ ALL CHECKS PASSED'));
  process.exit(fails.length ? 1 : 0);
})();
