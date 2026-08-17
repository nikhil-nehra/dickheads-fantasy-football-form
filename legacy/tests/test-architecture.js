// End-to-end test of the multi-survey architecture, driven against the REAL
// Code.gs running in a sandbox. Covers the lifecycle promises:
//   - surveys can be closed and REACTIVATED, losing nothing
//   - closing is enforced server-side, not just in the UI
//   - boards keep working no matter what state their survey is in
const { chromium } = require('playwright');
const path = require('path');
const { makeBackend, attach } = require('./gas-sandbox');
const ROOT = require('path').resolve(__dirname, '..');   // repo root

const F = f => 'file://' + path.resolve(ROOT + '/' + f);
const PIN = ['7', '5', '3', '1'];
const fails = [];
const check = (l, c, e) => { console.log(`${c ? '  PASS' : '  FAIL'}  ${l}${!c && e ? '\n        → ' + e : ''}`); if (!c) fails.push(l); };

let backend, browser, ctx;

async function page() {
  const p = await ctx.newPage();
  p._errs = [];
  p.on('pageerror', e => p._errs.push(String(e)));
  p.on('console', m => { if (m.type() === 'error') p._errs.push('console: ' + m.text()); });
  return p;
}
async function open(file, wait = 900) {
  const p = await page();
  await p.goto(F(file));
  await p.waitForTimeout(wait);
  return p;
}
async function enterPin(p) {
  for (const k of PIN) { await p.locator('.pin-key', { hasText: k }).click(); await p.waitForTimeout(60); }
  await p.waitForTimeout(900);
}

function seed() {
  backend = makeBackend();
  const s1 = (name, punishment, beef, buyIn, cant, loc, inPerson) => JSON.stringify({
    name, punishment, buyIn, locality: loc || 'local',
    weekendOrder: ['w2', 'w1', 'w3'], cantMake: cant || {}, inPerson: inPerson || {},
    beefOrder: beef, prizePlan: { places: [50, 25, 15], regSeason: 10 },
    submittedAt: new Date().toISOString()
  });
  backend.seedRaw('response:Nikhil Nehra', s1('Nikhil Nehra', 'Loser gets a league-chosen tattoo', ['Ryan Latin', 'Lyon Burns'], '$50'));
  backend.seedRaw('response:Ryan Latin', s1('Ryan Latin', 'Loser runs a 5k in a hot dog costume', ['Nikhil Nehra', 'Lyon Burns'], '$50', { w1fri: true }, 'oot', { w2: false }));
  backend.seedRaw('response:Lyon Burns', s1('Lyon Burns', 'Loser gets a league-chosen tattoo', ['Aidan Duncan', 'Nikhil Nehra'], '$25'));
  backend.seedRaw('response:Aidan Duncan', s1('Aidan Duncan', 'Loser wears a rival jersey all season', ['Lyon Burns', 'Ryan Latin'], '$50', { w3mon: true }));
  // Someone dropped from the roster (Pranav -> Samay). His row stays in the
  // sheet and must be excluded from every count without being destroyed.
  backend.seedRaw('response:Pranav Chelat', s1('Pranav Chelat', 'Loser shaves an eyebrow', ['Nikhil Nehra'], '$100'));
}

(async () => {
  seed();
  browser = await chromium.launch();
  ctx = await browser.newContext({ viewport: { width: 430, height: 950 }, deviceScaleFactor: 2 });
  await attach(ctx, backend);

  // ═══ 1. BACKEND CONTRACT (Code.gs directly) ═══
  console.log('\n[1] Code.gs contract');
  check('list with no prefix returns everything (backward compatible)',
    backend.doGet({ action: 'list' }).responses.length === 5);
  check('prefix filter narrows the payload',
    backend.doGet({ action: 'list', prefix: 's2:' }).responses.length === 0);
  check('list also carries the status map', 'status' in backend.doGet({ action: 'list' }));
  check('unknown survey defaults to open (old sheets keep working)',
    backend.doPost({ key: 'response:Sean Vargeese', value: '{"name":"Sean Vargeese","buyIn":"$50","beefOrder":[]}' }).ok === true);
  check('meta: writes rejected without the PIN',
    backend.doPost({ key: 'meta:status', value: '{}' }).error === 'forbidden');
  check('s2force: writes rejected without the PIN',
    backend.doPost({ key: 's2force:A::B', value: '{}' }).error === 'forbidden');
  check('meta: writes accepted with the PIN',
    backend.doPost({ key: 'meta:status', value: '{"intake":{"status":"open"}}', pin: 'REDACTED' }).ok === true);

  // ═══ 2. HUB ═══
  console.log('\n[2] The hub');
  let hub = await open('hub.html');
  check('hub lists both surveys', (await hub.locator('.hub-card:not(.is-board)').count()) === 2);
  check('hub lists all three boards', (await hub.locator('.hub-card.is-board').count()) === 3);
  check('both surveys show as open', (await hub.locator('.st-badge.open').count()) === 2);
  const hubTxt = await hub.locator('main').innerText();
  check('hub shows response counts', /5 \/ 14/.test(hubTxt), hubTxt.slice(0, 300));
  check('no archive section while nothing is archived', (await hub.locator('.archive-toggle').count()) === 0);
  check('an off-roster response is NOT counted', !/6 \/ 14/.test(hubTxt), hubTxt.slice(0, 300));
  await hub.screenshot({ path: ROOT + '/tests/shots/20-hub-open.png', fullPage: true });

  // ═══ 3. DESK: CLOSE A SURVEY ═══
  console.log('\n[3] Desk — closing a survey');
  let desk = await open('desk.html');
  check('desk is PIN-gated', (await desk.locator('.pin-card').count()) === 1);
  await enterPin(desk);
  check('PIN opens the desk', (await desk.locator('.tabbar').count()) === 1);
  check('control tab lists every survey', (await desk.locator('.ctl-row').count()) === 2);
  await desk.screenshot({ path: ROOT + '/tests/shots/21-desk-control.png', fullPage: true });

  await desk.locator('.ctl-row').first().locator('.ctl-btn', { hasText: 'Closed' }).click();
  await desk.waitForTimeout(900);
  check('status persisted to the sheet',
    JSON.parse(backend.doGet({ action: 'status' }).status.intake.status ? JSON.stringify(backend.doGet({ action: 'status' }).status) : '{}').intake.status === 'closed');
  check('closed button now shows as active',
    (await desk.locator('.ctl-row').first().locator('.ctl-btn.on.warn').count()) === 1);

  // ═══ 4. SERVER-SIDE ENFORCEMENT ═══
  console.log('\n[4] Closing is enforced server-side');
  const rejected = backend.doPost({ key: 'response:David Moton', value: '{"name":"David Moton","buyIn":"$50","beefOrder":[]}' });
  check('a direct write to a closed survey is REJECTED', rejected.ok === false && rejected.error === 'survey_closed',
    JSON.stringify(rejected));
  check('rejection names the survey and status', rejected.survey === 'intake' && rejected.status === 'closed');
  check('the commissioner can still write with the PIN',
    backend.doPost({ key: 'response:David Moton', value: '{"name":"David Moton","buyIn":"$50","beefOrder":[]}', pin: 'REDACTED' }).ok === true);
  check('the OTHER survey is unaffected',
    backend.doPost({ key: 's2:Nikhil Nehra', value: '{"__kind":"s2","name":"Nikhil Nehra","podium":[],"picks":{},"proposals":{}}' }).ok === true);

  // ═══ 5. CLOSED SURVEY IN THE BROWSER ═══
  console.log('\n[5] A closed survey in the browser');
  let intake = await open('index.html');
  check('closed banner shown', (await intake.locator('.closed-banner').count()) === 1);
  check('form card is read-only', (await intake.locator('.card.readonly').count()) === 1);
  check('submit zone replaced with a lock notice', (await intake.locator('.readonly-note').count()) === 1);
  check('lock button is gone', (await intake.locator('.lock-btn').count()) === 0);
  await intake.selectOption('#nameSelect', 'Ryan Latin');
  await intake.waitForTimeout(900);
  // textarea contents live in .value, not innerText
  const ryanPun = await intake.locator('#punishmentInput').inputValue();
  check('a closed survey still shows you YOUR saved answers', ryanPun.includes('hot dog costume'), ryanPun);
  check('saved weekend ranking restored',
    JSON.stringify(await intake.locator('.wk-row').evaluateAll(rs => rs.map(r => r.getAttribute('data-id')))) === '["w2","w1","w3"]',
    await intake.locator('.wk-row').evaluateAll(rs => rs.map(r => r.getAttribute('data-id'))).then(JSON.stringify));
  check('saved per-day unavailability restored',
    (await intake.locator('.wk-label .sub').allInnerTexts()).some(t => t.includes('Out:')),
    (await intake.locator('.wk-label .sub').allInnerTexts()).join(' | '));
  check('saved buy-in restored', (await intake.locator('.chip.selected').innerText()) === '$50');
  check('saved locality restored', (await intake.locator('.chip-sm.selected').first().innerText()).includes('Out of town'));
  await intake.screenshot({ path: ROOT + '/tests/shots/22-intake-closed.png', fullPage: true });

  // ═══ 6. BOARDS KEEP WORKING ═══
  console.log('\n[6] Boards outlive their survey');
  let boards = await open('boards.html#draft');
  check('draft board opens with its survey closed', (await boards.locator('.board-hero h2').innerText()).includes('Draft Day'));
  const draftTxt = await boards.locator('main').innerText();
  check('draft board ranks the weekends', draftTxt.includes('avg rank'), draftTxt.slice(0, 300));
  check('draft board names the leading weekend', /Aug 28|Aug 21|Sep 4/.test(draftTxt));
  check('draft board splits in-town vs out-of-town', draftTxt.includes('IN TOWN') && draftTxt.includes('OUT OF TOWN'));
  check('draft board flags virtual attendance', draftTxt.includes('virtual'), draftTxt.slice(0, 600));
  check('draft board lists who has not answered', draftTxt.includes('Still no answer from'));
  await boards.screenshot({ path: ROOT + '/tests/shots/23-board-draft.png', fullPage: true });

  await boards.locator('.tab', { hasText: 'The Pot' }).click();
  await boards.waitForTimeout(500);
  const potTxt = await boards.locator('main').innerText();
  check('pot board picks the leading buy-in', potTxt.includes('$50'), potTxt.slice(0, 300));
  check('pot board computes the pot ($50 x 14 = $700)', potTxt.includes('$700'), potTxt.slice(0, 400));
  check('pot board shows dollar amounts per place', /\$\d/.test(potTxt) && potTxt.includes('place'));
  check('tab click updates the hash', boards.url().endsWith('#pot'), boards.url());
  await boards.screenshot({ path: ROOT + '/tests/shots/24-board-pot.png', fullPage: true });

  // ═══ 7. REACTIVATION ═══
  console.log('\n[7] Reactivating');
  await desk.locator('.ctl-row').first().locator('.ctl-btn', { hasText: 'Open' }).click();
  await desk.waitForTimeout(900);
  check('server accepts writes again after reopening',
    backend.doPost({ key: 'response:Prabhas Dande', value: '{"name":"Prabhas Dande","buyIn":"$25","beefOrder":[]}' }).ok === true);
  intake = await open('index.html');
  check('reopened form has no closed banner', (await intake.locator('.closed-banner').count()) === 0);
  check('reopened form is writable again', (await intake.locator('.lock-btn').count()) === 1);
  // 5 seeded (incl. the off-roster row) + Sean + David + Prabhas
  check('reopening lost no data', backend.doGet({ action: 'list', prefix: 'response:' }).responses.length === 8,
    backend.doGet({ action: 'list', prefix: 'response:' }).responses.length + ' rows');
  check('the off-roster row survived every status change untouched',
    !!backend.doGet({ action: 'get', key: 'response:Pranav Chelat' }).value);

  // ═══ 8. ARCHIVE ═══
  console.log('\n[8] Archiving');
  await desk.locator('.ctl-row').first().locator('.ctl-btn', { hasText: 'Archived' }).click();
  await desk.waitForTimeout(900);
  hub = await open('hub.html');
  check('archived survey leaves the main list', (await hub.locator('.hub-card:not(.is-board)').count()) === 1);
  check('archive section appears', (await hub.locator('.archive-toggle').count()) === 1);
  await hub.locator('.archive-toggle').click();
  await hub.waitForTimeout(300);
  check('archived survey is still reachable', (await hub.locator('.hub-card.is-archived').count()) === 1);
  check('boards are NOT hidden by archiving', (await hub.locator('.hub-card.is-board').count()) === 3);
  await hub.screenshot({ path: ROOT + '/tests/shots/25-hub-archived.png', fullPage: true });

  // ═══ 9. DRAFT STATUS ═══
  console.log('\n[9] Draft status');
  await desk.locator('.ctl-row').first().locator('.ctl-btn', { hasText: 'Draft' }).click();
  await desk.waitForTimeout(900);
  hub = await open('hub.html');
  check('a draft survey is hidden from the league entirely',
    (await hub.locator('.hub-card:not(.is-board)').count()) === 1 && (await hub.locator('.archive-toggle').count()) === 0);
  intake = await open('index.html');
  check('the commissioner can still preview a draft survey', (await intake.locator('.closed-banner.draft').count()) === 1);
  // put it back so later assertions are on a sane state
  await desk.locator('.ctl-row').first().locator('.ctl-btn', { hasText: 'Open' }).click();
  await desk.waitForTimeout(900);

  // ═══ 10. RIVALRY END-TO-END THROUGH THE NEW STACK ═══
  console.log('\n[10] Rivalry negotiation on the shared core');
  const A = await open('rivalry.html');
  await A.selectOption('#nameSelect', 'Nikhil Nehra');
  await A.waitForTimeout(500);
  const ballot = await A.locator('.pun-txt').allInnerTexts();
  check('ballot pulled + deduped Survey 1 ideas', ballot.length === 3, ballot.join(' | '));
  await A.locator('.pun-opt').nth(0).click();
  await A.locator('.target-opt').nth(0).click();
  await A.waitForTimeout(200);
  const rivalName = await A.locator('.vs-name').nth(1).innerText();
  check('rival comes from the fixed RIVAL_PAIRS, not the beef rankings',
    rivalName.toLowerCase().includes('sean'), rivalName);
  await A.locator('[data-prop="rname"]').fill('The Battle for the Last Brain Cell');
  await A.waitForTimeout(150);
  await A.locator('.neg-card').first().locator('.pick-opt').nth(0).click();
  await A.waitForTimeout(150);
  await A.locator('.neg-card').first().locator('.neg-btn:not(.undo)').click();
  await A.waitForTimeout(800);

  const B = await open('rivalry.html');
  await B.selectOption('#nameSelect', 'Sean Vargeese');
  await B.waitForTimeout(500);
  check("rival's proposal visible immediately",
    (await B.locator('.prop-box.theirs .prop-val').first().innerText()).includes('Brain Cell'));
  await B.locator('.neg-card').first().locator('.pick-opt').nth(1).click();
  await B.waitForTimeout(150);
  await B.locator('.neg-card').first().locator('.neg-btn:not(.undo)').click();
  await B.waitForTimeout(800);
  check('mutual agreement locks the line', (await B.locator('.neg-status.agreed').count()) === 1);
  await B.screenshot({ path: ROOT + '/tests/shots/26-rivalry-agreed.png', fullPage: true });

  boards = await open('boards.html#rivalry');
  // Pair order is score-then-alphabetical, so never index blindly — find the pair.
  const nrPair = boards.locator('.board-pair').filter({ has: boards.locator('.bp-vs', { hasText: 'Nikhil Nehra' }) });
  check('the Nikhil/Sean pair exists on the board', (await nrPair.count()) === 1);
  check('board shows all seven configured pairs', (await boards.locator('.board-pair').count()) === 7);
  check('agreed name is that pair\'s board title',
    (await nrPair.locator('.bp-title').innerText()).toLowerCase().includes('brain cell'),
    await nrPair.locator('.bp-title').innerText());
  check('un-negotiated pairs still show as not set',
    (await boards.locator('.mini-badge.pend').count()) >= 1);
  await boards.screenshot({ path: ROOT + '/tests/shots/27-board-rivalry.png', fullPage: true });

  // ═══ 11. DESK FORCE RULING ═══
  console.log('\n[11] Desk force ruling');
  desk = await open('desk.html');
  await enterPin(desk);
  await desk.locator('.tab', { hasText: 'Rivalry Week' }).click();
  await desk.waitForTimeout(600);
  const deskRiv = await desk.locator('main').innerText();
  check('punishment tally rendered', /\d+ pts/.test(deskRiv), deskRiv.slice(0, 300));
  const nrRow = desk.locator('.cpair').filter({ has: desk.locator('.cpair-who', { hasText: 'Nikhil Nehra' }) });
  await nrRow.locator('.cpair-head').click();
  await desk.waitForTimeout(400);
  check('desk shows the agreed line for that pair',
    (await nrRow.locator('.cf-res.ok').count()) >= 1);
  // each un-agreed field has its own Force box — scope to the "side" one
  const sideBox = nrRow.locator('.force-box:has([data-force$="|side"])');
  await sideBox.locator('input').fill('COMMISSIONER RULES: loser does both');
  await sideBox.locator('.force-btn').click();
  await desk.waitForTimeout(900);
  const forceRow = backend.doGet({ action: 'get', key: 's2force:Nikhil Nehra::Sean Vargeese' }).value;
  check('ruling written under the right pair key, with the PIN', !!forceRow, String(forceRow));
  check('ruling text stored', !!forceRow && JSON.parse(forceRow).side === 'COMMISSIONER RULES: loser does both');
  boards = await open('boards.html#rivalry');
  check('ruling appears on the public board', (await boards.locator('.mini-badge.forced').count()) === 1);
  const nrPair2 = boards.locator('.board-pair').filter({ has: boards.locator('.bp-vs', { hasText: 'Nikhil Nehra' }) });
  check('ruling shows under the correct pair',
    (await nrPair2.innerText()).includes('loser does both'));
  await desk.screenshot({ path: ROOT + '/tests/shots/28-desk-rivalry.png', fullPage: true });

  // ═══ 12. INTAKE DESK TAB + PAIR EXPORT ═══
  console.log('\n[12] Desk intake tab');
  await desk.locator('.tab', { hasText: 'Intake' }).click();
  await desk.waitForTimeout(600);
  const deskIn = await desk.locator('main').innerText();
  check('intake responses listed', (await desk.locator('.resp-item').count()) >= 4);
  check('suggested pairings shown', deskIn.includes('SUGGESTED RIVALRY PAIRINGS'));
  check('punishment ideas listed', deskIn.includes('hot dog costume'));
  await desk.locator('.resp-head').first().click();
  await desk.waitForTimeout(300);
  check('individual response expands', (await desk.locator('.resp-item.open .resp-body').count()) === 1);
  check('off-roster row is NOT in the individual responses', !deskIn.includes('Pranav Chelat'), 'Pranav leaked into the tallies');

  console.log('\n[12b] Off-roster surfacing');
  await desk.locator('.tab', { hasText: 'League Control' }).click();
  await desk.waitForTimeout(500);
  const ctlTxt = await desk.locator('main').innerText();
  check('desk surfaces the off-roster row instead of hiding it', ctlTxt.includes('OFF THE ROSTER') && ctlTxt.includes('Pranav Chelat'), ctlTxt.slice(0, 400));
  check('no setup warning now that RIVAL_PAIRS is set', (await desk.locator('.setup-warn').count()) === 0);
  await desk.screenshot({ path: ROOT + '/tests/shots/29-desk-intake.png', fullPage: true });

  // ═══ 13. ERRORS ═══
  console.log('\n[13] Runtime errors');
  for (const [n, p] of [['hub', hub], ['desk', desk], ['boards', boards], ['intake', intake], ['rivalry A', A], ['rivalry B', B]]) {
    check(`no JS errors — ${n}`, p._errs.length === 0, p._errs.slice(0, 2).join(' | '));
  }

  await browser.close();
  console.log('\n' + (fails.length ? `✗ ${fails.length} FAILED:\n  - ` + fails.join('\n  - ') : '✓ ALL CHECKS PASSED'));
  process.exit(fails.length ? 1 : 0);
})();
