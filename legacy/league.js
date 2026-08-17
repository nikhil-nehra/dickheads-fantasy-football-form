/* ═══════════════════════════════════════════════════════════════════════════
   THE DICKHEAD'S FANTASY FOOTBALL LEAGUE — SHARED CORE
   ═══════════════════════════════════════════════════════════════════════════

   Loaded by every page (hub, both surveys, boards, desk) with a plain
   <script src="league.js"></script> before the page's own script.

   THIS IS THE ONLY PLACE you edit the roster, the PIN, the backend URL, the
   survey list, the punishment ballot or the rivalry pairs. Change it here and
   every page picks it up.

   Everything below is declared with var/function on purpose, so it lands on
   `window` exactly like it did when each page was self-contained. Inline
   onclick="..." handlers keep working unchanged.
   ═══════════════════════════════════════════════════════════════════════════ */


/* ═════════════════════════════════════════════════════════════
   1. BACKEND
   ═════════════════════════════════════════════════════════════ */

/* The deployed Apps Script Web App URL. See README.md → "Backend setup".
   Leave it as-is and every page still renders, but nothing saves. */
var API_URL = 'https://script.google.com/macros/s/AKfycbzbz62iEh5NBOVqsqsoa1ZfNIK3sHKOvf9FBfVsizvD05M-vfLz_Pqep6pLhYanVVIF/exec';

/* Must match COMMISH_PIN in Code.gs. Soft lock — see README "Cautions". */
var COMMISH_PIN = 'REDACTED';


/* ═════════════════════════════════════════════════════════════
   2. THE LEAGUE
   ═════════════════════════════════════════════════════════════ */

var ROSTER = [
  "Nikhil Nehra","Ryan Latin","Lyon Burns","Aidan Duncan","Stephen Comeaux",
  "Jaswin Jabbal","Dhruv Nandwani","Sean Vargeese","Shishir Nambi","Matthew Yoshida",
  "Samay Mohapatra","Prabhas Dande","David Moton","Rayyan Ali"
];

/* Responses are keyed by name, so a roster change can strand an old row —
   Pranav Chelat's, for instance, after he was replaced by Samay. Anything
   whose name is no longer on the roster is kept out of every count, tally and
   board, so the numbers stay honest. Nothing is deleted: the Desk lists those
   rows under "off the roster" so they can't vanish silently. */
function onRoster(name){ return ROSTER.indexOf(name) !== -1; }


/* ═════════════════════════════════════════════════════════════
   3. THE SURVEY REGISTRY
   ═════════════════════════════════════════════════════════════
   Adding a survey = a new HTML file + one entry here. It then appears on the
   hub, in the desk's tab bar, and in the open/close controls automatically.

   `status` is NOT stored here — it lives in the Google Sheet under
   `meta:status` so you can open and close surveys from the Commissioner's
   Desk without touching code. `defaultStatus` is only the fallback for a
   survey the sheet has never heard of.

   ┌──────────────────────────────────────────────────────────────────────┐
   │ SEPTEMBER SWAP — after the draft, when intake is closed:              │
   │   1. rename  index.html  →  intake.html                               │
   │   2. rename  hub.html    →  index.html                                │
   │   3. change the intake `file` below from 'index.html' to 'intake.html' │
   │ That's it. The root URL everyone already has becomes the hub.         │
   └──────────────────────────────────────────────────────────────────────┘ */
var SURVEYS = [
  {
    id: 'intake',
    file: 'index.html',                 // ← step 3 of the September swap
    title: 'Pre-Season Intake',
    short: 'Intake',
    blurb: 'Buy-in, punishment ideas, draft availability, rivalry rankings and the prize split.',
    keyPrefix: 'response:',
    prefixes: ['response:'],
    defaultStatus: 'open'
  },
  {
    id: 'rivalry',
    file: 'rivalry.html',
    title: 'Rivalry Week & The Punishment',
    short: 'Rivalry Week',
    blurb: 'Vote on the punishment and who serves it, then settle your rivalry in writing.',
    keyPrefix: 's2:',
    prefixes: ['s2:', 's2force:'],
    defaultStatus: 'open'
  }
];

/* Permanent public result tabs. These are deliberately NOT tied to a survey's
   status — a board keeps working forever after its survey closes or is
   archived. That's the whole point of them. All live in boards.html. */
var BOARDS = [
  { id:'rivalry', title:'The Rivalry Board', from:'rivalry',
    blurb:'Every agreed rivalry name, bet and side punishment. This is the one to paste in Sleeper.' },
  { id:'draft',   title:'Draft Day',         from:'intake',
    blurb:'The winning weekend, who is showing up in person, and who is still unaccounted for.' },
  { id:'pot',     title:'The Pot',           from:'intake',
    blurb:'The buy-in that won, the total pot, and the prize split in real dollars.' }
];

function surveyById(id){ for(var i=0;i<SURVEYS.length;i++){ if(SURVEYS[i].id===id) return SURVEYS[i]; } return null; }
function boardById(id){ for(var i=0;i<BOARDS.length;i++){ if(BOARDS[i].id===id) return BOARDS[i]; } return null; }


/* ═════════════════════════════════════════════════════════════
   4. SURVEY 1 CONFIG — pre-season intake
   ═════════════════════════════════════════════════════════════ */

var WEEKENDS = [
  {id:'w1', label:'Aug 21–23', days:[
    {id:'w1fri', short:'Fri Aug 21'},
    {id:'w1sat', short:'Sat Aug 22'},
    {id:'w1sun', short:'Sun Aug 23'}
  ]},
  {id:'w2', label:'Aug 28–30', days:[
    {id:'w2fri', short:'Fri Aug 28'},
    {id:'w2sat', short:'Sat Aug 29'},
    {id:'w2sun', short:'Sun Aug 30'}
  ]},
  {id:'w3', label:'Sep 4–7', days:[
    {id:'w3fri', short:'Fri Sep 4'},
    {id:'w3sat', short:'Sat Sep 5'},
    {id:'w3sun', short:'Sun Sep 6'},
    {id:'w3mon', short:'Mon Sep 7 · Labor Day'}
  ]}
];
var BUYINS = ['$25','$50','$100'];

var PRIZE_STEP = 5;
var MAX_PLACES = 6;
var PLACE_TEMPLATES = {
  1:[100], 2:[65,35], 3:[60,30,10], 4:[50,25,15,10],
  5:[45,25,15,10,5], 6:[40,25,15,10,5,5]
};
var DEFAULT_PLACES = [50,25,10,5];
var DEFAULT_REG_SEASON = 10;
var REG_SEASON_DEFAULT = 10;


/* ═════════════════════════════════════════════════════════════
   5. SURVEY 2 CONFIG — rivalry week & the punishment
   ═════════════════════════════════════════════════════════════ */

/* ── THE PUNISHMENT BALLOT ──────────────────────────────────────
   Paste your official shortlist below, one quoted string per line, each
   ending with a comma. These appear at the top of the ballot marked ★. */
var COMMISSIONER_PUNISHMENTS = [
  // 'Wear a full opposing-team kit to the next league meetup',
  // 'Record a 60-second apology video for the group chat',
];

/* Also pull in every punishment idea people wrote in Survey 1? */
var INCLUDE_SURVEY1_IDEAS = true;

/* How many each person ranks (1st = 3pts, 2nd = 2pts, 3rd = 1pt). */
var PODIUM_SIZE = 3;
var ALLOW_PUNISHMENT_WRITEIN = true;

/* ── WHO TAKES THE PUNISHMENT ── */
var PUNISHMENT_TARGETS = [
  { id:'reg-last',   label:'Last place — regular season',       sub:'Worst record when the regular season ends, playoffs be damned' },
  { id:'toilet',     label:'Loser of the consolation bracket',  sub:'Whoever loses the toilet bowl / loser’s playoff final' },
  { id:'final-last', label:'Last place — final standings',      sub:'After every playoff and consolation game is done' },
  { id:'fewest-pts', label:'Fewest total points scored',        sub:'Whole season. Bad luck is no excuse.' },
  { id:'both',       label:'Both — reg season AND toilet bowl', sub:'Two punishments, two victims. Double the content.' }
];
var ALLOW_TARGET_WRITEIN = true;

/* ── RIVALRY PAIRS ──────────────────────────────────────────────
   THE COMMISSIONER SETS THESE. One line per pairing, both names spelled
   EXACTLY as in ROSTER. Until it's filled in, the pages fall back to
   auto-pairing from the Survey 1 beef rankings so nothing is ever broken —
   but the Desk will nag you, because auto pairs re-shuffle as late Survey 1
   responses land. */
var RIVAL_PAIRS = [
  ['Nikhil Nehra',    'Sean Vargeese'],
  ['Shishir Nambi',   'Aidan Duncan'],
  ['Stephen Comeaux', 'David Moton'],
  ['Lyon Burns',      'Matthew Yoshida'],
  ['Jaswin Jabbal',   'Dhruv Nandwani'],
  ['Ryan Latin',      'Rayyan Ali'],
  ['Prabhas Dande',   'Samay Mohapatra'],
];

/* ── WHAT EACH PAIR NEGOTIATES ──
   Add a fourth entry and it appears in the survey, the board and the desk
   automatically. */
var NEG_FIELDS = [
  { key:'rname', tag:'RIVALRY NAME', short:'Rivalry name',
    q:'What is this rivalry called?',
    help:'The name that goes on the Rivalry Board and in the league chat forever. Make it hurt.',
    ph:'e.g. The Battle for the Last Brain Cell' },
  { key:'bet', tag:'THE SET BET', short:'The bet',
    q:'What are the two of you betting on rivalry week?',
    help:'The actual stake on your head-to-head matchup. Money, favours, dignity — your call, as long as you both agree.',
    ph:'e.g. Loser Venmos the winner $20 and posts the receipt' },
  { key:'side', tag:'SIDE PUNISHMENT', short:'Side punishment',
    q:'What does the loser of your matchup have to do?',
    help:'Separate from the league-wide punishment. This one is just between you two.',
    ph:'e.g. Loser makes the winner’s team name their own for a week' }
];

/* Auto-refresh interval so rivals see each other's moves without reloading. */
var POLL_MS = 15000;


/* ═════════════════════════════════════════════════════════════
   6. UTILITIES
   ═════════════════════════════════════════════════════════════ */

function escapeHtml(str){
  return String(str == null ? '' : str)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
function esc(s){ return escapeHtml(s); }
function jsStr(s){ return String(s==null?'':s).replace(/\\/g,'\\\\').replace(/'/g,"\\'").replace(/\n/g,'\\n'); }
function norm(s){ return String(s==null?'':s).trim().replace(/\s+/g,' ').toLowerCase(); }
function clean(s){ return String(s==null?'':s).trim().replace(/\s+/g,' '); }
function firstName(n){ return String(n||'').split(' ')[0]; }
function ordinal(n){ return n + (['th','st','nd','rd'][(n%100>10&&n%100<14)?0:(n%10<4?n%10:0)]); }
function money(n){ return '$'+Number(n).toLocaleString(); }
function localityLabel(l){ return l==='oot' ? 'Out of town' : (l==='local' ? 'In town (Dallas)' : '—'); }
function potTotal(buyIn){
  var n = parseInt(String(buyIn||'').replace(/[^0-9]/g,''),10);
  return n ? n * ROSTER.length : 0;
}
function prizePlanText(plan){
  if(!plan || !Array.isArray(plan.places)) return 'No preference (commissioner decides)';
  var parts = plan.places.map(function(p,i){ return ordinal(i+1)+' '+p+'%'; });
  if(plan.regSeason>0) parts.push('reg-season leader '+plan.regSeason+'%');
  return parts.join(' · ');
}
function fmtDate(iso){
  if(!iso) return '';
  var d = new Date(iso);
  return isNaN(d) ? '' : d.toLocaleString(undefined,{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'});
}
function el(html){ var t=document.createElement('template'); t.innerHTML=String(html).trim(); return t.content; }


/* ═════════════════════════════════════════════════════════════
   7. THE STORE
   ═════════════════════════════════════════════════════════════
   Every page talks to the sheet through here. `list()` takes key prefixes so
   a page only downloads its own rows instead of the whole league's history. */

var LeagueStore = {
  ready: function(){ return API_URL && API_URL.indexOf('PASTE_YOUR') === -1; },

  get: function(key){
    if(!this.ready()) return Promise.reject(new Error('API_URL not configured'));
    return fetch(API_URL + '?action=get&key=' + encodeURIComponent(key))
      .then(function(r){ if(!r.ok) throw new Error('get failed'); return r.json(); })
      .then(function(d){ return (d && d.value) ? { value:d.value } : null; });
  },

  /* opts.pin — send the commissioner PIN so the write is allowed even when
     the survey is closed (and for commissioner-only keys). Resolves to the
     server's reply so callers can surface `survey_closed`. */
  set: function(key, valueString, opts){
    if(!this.ready()) return Promise.reject(new Error('API_URL not configured'));
    var body = { key:key, value:valueString };
    if(opts && opts.pin) body.pin = opts.pin;
    return fetch(API_URL, {
      method:'POST',
      headers:{ 'Content-Type':'text/plain;charset=utf-8' },   // avoids a CORS preflight
      body: JSON.stringify(body)
    }).then(function(r){
      if(!r.ok) throw new Error('set failed');
      return r.json().catch(function(){ return { ok:true }; });
    }).then(function(res){
      if(res && res.ok === false){
        var err = new Error(res.message || res.error || 'save rejected');
        err.code = res.error; err.status = res.status;
        throw err;
      }
      return res || { ok:true };
    });
  },

  /* prefixes: array of key prefixes, or omit for everything.
     Resolves to { intake, rivalry, force, status, raw }. */
  list: function(prefixes){
    if(!this.ready()) return Promise.reject(new Error('API_URL not configured'));
    var url = API_URL + '?action=list&_=' + Date.now();
    if(prefixes && prefixes.length) url += '&prefix=' + encodeURIComponent(prefixes.join(','));
    return fetch(url)
      .then(function(r){ if(!r.ok) throw new Error('list failed'); return r.json(); })
      .then(function(d){ return classifyRows(d.responses || [], d.status || {}); });
  },

  status: function(){
    if(!this.ready()) return Promise.reject(new Error('API_URL not configured'));
    return fetch(API_URL + '?action=status&_=' + Date.now())
      .then(function(r){ if(!r.ok) throw new Error('status failed'); return r.json(); })
      .then(function(d){ return d.status || {}; });
  }
};

/* The sheet hands back values without their keys, so rows are sorted by
   shape. Survey 1 rows predate the __kind tag, hence the beefOrder sniff.

   Rows belonging to someone no longer on the roster are diverted into
   `offRoster` rather than dropped, so counts stay right without the data
   quietly disappearing. */
function classifyRows(values, status){
  var out = { intake:[], rivalry:{}, force:{}, offRoster:[], status:status||{}, raw:[] };
  values.forEach(function(v){
    var o = null;
    try{ o = (typeof v === 'string') ? JSON.parse(v) : v; }catch(e){ return; }
    if(!o || typeof o !== 'object') return;
    out.raw.push(o);

    if(o.__kind === 's2' && o.name){
      if(onRoster(o.name)) out.rivalry[o.name] = o;
      else out.offRoster.push({ survey:'rivalry', name:o.name, row:o });
    }
    else if(o.__kind === 's2force' && o.pairId) out.force[o.pairId] = o;
    else if(o.name && (o.beefOrder || o.buyIn)){
      if(onRoster(o.name)) out.intake.push(o);
      else out.offRoster.push({ survey:'intake', name:o.name, row:o });
    }
  });
  return out;
}


/* ═════════════════════════════════════════════════════════════
   8. SURVEY LIFECYCLE
   ═════════════════════════════════════════════════════════════
   draft    — commissioner preview only; hidden from the hub, writes blocked
   open     — accepting responses
   closed   — page loads read-only, shows saved answers, writes blocked
   archived — tucked into the hub's Archive; otherwise identical to closed

   Reactivating is just setting it back to 'open'. Nothing is ever deleted, so
   a survey can be closed and reopened as many times as you like. */

var STATUS_META = {
  draft:    { label:'Draft',    hubLabel:'Not released yet', writable:false, listed:false },
  open:     { label:'Open',     hubLabel:'Open now',         writable:true,  listed:true  },
  closed:   { label:'Closed',   hubLabel:'Voting closed',    writable:false, listed:true  },
  archived: { label:'Archived', hubLabel:'Archived',         writable:false, listed:false }
};
var STATUS_ORDER = ['draft','open','closed','archived'];

var LeagueStatus = {
  map: {},
  hydrate: function(map){ this.map = map || {}; return this.map; },
  of: function(surveyId){
    var e = this.map[surveyId];
    var s = !e ? null : (typeof e === 'string' ? e : e.status);
    if(!s || !STATUS_META[s]){
      var sv = surveyById(surveyId);
      return (sv && sv.defaultStatus) || 'open';
    }
    return s;
  },
  meta: function(surveyId){ return STATUS_META[this.of(surveyId)] || STATUS_META.open; },
  isOpen: function(surveyId){ return this.of(surveyId) === 'open'; },
  changedAt: function(surveyId){
    var e = this.map[surveyId];
    return (e && typeof e === 'object') ? e.changedAt : null;
  },
  /* Commissioner-only. The PIN is verified server-side in Code.gs. */
  set: function(surveyId, status, pin){
    var self = this;
    var next = {};
    Object.keys(this.map).forEach(function(k){ next[k] = self.map[k]; });
    next[surveyId] = { status:status, changedAt:new Date().toISOString() };
    return LeagueStore.set('meta:status', JSON.stringify(next), { pin:pin })
      .then(function(res){ self.map = next; return res; });
  }
};


/* ═════════════════════════════════════════════════════════════
   9. RIVALRY LOGIC (shared by the survey, the board and the desk)
   ═════════════════════════════════════════════════════════════ */

function pairIdOf(a,b){ return [a,b].slice().sort().join('::'); }

/* Auto-pairing from Survey 1 mutual beef. Only used as a fallback while
   RIVAL_PAIRS is empty. For every pair we add both players' desire for each
   other (normalised 0..1 by rank), then greedily lock the strongest first. */
function computeRivalryPairs(responses){
  var names = responses.map(function(r){ return r.name; });
  var byName = {}; responses.forEach(function(r){ byName[r.name] = r; });
  function rankOf(a,b){
    var order = (byName[a] && byName[a].beefOrder) || [];
    var i = order.indexOf(b);
    return i < 0 ? 0 : i + 1;
  }
  function desire(a,b){
    var order = (byName[a] && byName[a].beefOrder) || [];
    var i = order.indexOf(b);
    if(i < 0) return 0;
    var n = order.length;
    return n > 1 ? 1 - i/(n-1) : 1;
  }
  var cand = [];
  for(var i=0;i<names.length;i++){
    for(var j=i+1;j<names.length;j++){
      var a=names[i], b=names[j], score = desire(a,b)+desire(b,a);
      if(score > 0) cand.push({ a:a, b:b, score:score, rankAB:rankOf(a,b), rankBA:rankOf(b,a) });
    }
  }
  cand.sort(function(x,y){ return (y.score - x.score) || x.a.localeCompare(y.a); });
  var used = {}, matched = [];
  cand.forEach(function(p){
    if(used[p.a] || used[p.b]) return;
    matched.push(p); used[p.a]=1; used[p.b]=1;
  });
  var unpaired = names.filter(function(n){ return !used[n]; });
  return { matched:matched, unpaired:unpaired };
}

function rivalStrength(score){
  var pct = Math.round(score / 2 * 100);
  var label = 'Loose matchup', cls = 's1';
  if(score >= 1.5){ label = 'Blood feud'; cls = 's4'; }
  else if(score >= 1.0){ label = 'Strong rivalry'; cls = 's3'; }
  else if(score >= 0.5){ label = 'Budding rivalry'; cls = 's2'; }
  return { label:label, cls:cls, pct:pct };
}

function pairsAreAuto(){
  return !(RIVAL_PAIRS||[]).some(function(p){
    return Array.isArray(p) && p.length===2 && p[0] && p[1] && p[0]!==p[1];
  });
}
function activePairs(intakeResponses){
  var fixed = (RIVAL_PAIRS||[]).filter(function(p){
    return Array.isArray(p) && p.length === 2 && p[0] && p[1] && p[0] !== p[1];
  });
  if(fixed.length) return fixed;
  return computeRivalryPairs(intakeResponses || []).matched.map(function(p){ return [p.a, p.b]; });
}
function rivalOf(name, intakeResponses){
  if(!name) return null;
  var pairs = activePairs(intakeResponses);
  for(var i=0;i<pairs.length;i++){
    if(pairs[i][0] === name) return pairs[i][1];
    if(pairs[i][1] === name) return pairs[i][0];
  }
  return null;
}
/* Typo tripwire for the hand-written pair list. */
function pairConfigProblems(){
  var problems = [], seen = {};
  (RIVAL_PAIRS||[]).forEach(function(p,i){
    if(!Array.isArray(p) || p.length !== 2) return;
    p.forEach(function(n){
      if(ROSTER.indexOf(n) === -1) problems.push('"'+n+'" (row '+(i+1)+') is not in ROSTER — check the spelling');
      if(seen[n]) problems.push('"'+n+'" appears in more than one pairing');
      seen[n] = true;
    });
  });
  return problems;
}

/* A negotiated line is settled when both rivals' picks match, or the
   commissioner has ruled. Nobody "owns" the lock — it's mutual by
   construction, because each player only ever writes their own row. */
function fieldStatus(a, b, fkey, s2, force){
  var pid = pairIdOf(a,b);
  var forced = force && force[pid];
  var fval = forced && clean(forced[fkey]);
  if(fval) return { state:'forced', value:fval, mine:null, theirs:null };

  var ra = s2[a], rb = s2[b];
  var pa = clean(ra && ra.picks && ra.picks[fkey]);
  var pb = clean(rb && rb.picks && rb.picks[fkey]);
  if(pa && pb && norm(pa) === norm(pb)) return { state:'agreed', value:pa, mine:pa, theirs:pb };
  return { state: (pa || pb) ? 'waiting' : 'open', value:null, mine:pa, theirs:pb };
}
function pairSettledCount(a, b, s2, force){
  return NEG_FIELDS.filter(function(f){
    var s = fieldStatus(a,b,f.key,s2,force);
    return s.state === 'agreed' || s.state === 'forced';
  }).length;
}

/* Punishment ballot: commissioner's shortlist first, then Survey 1 ideas,
   then anything already written in — all de-duplicated by normalised text. */
function buildBallot(intakeResponses, s2){
  var out = [], seen = {};
  (COMMISSIONER_PUNISHMENTS||[]).forEach(function(t){
    var c = clean(t); if(!c) return;
    var k = norm(c); if(seen[k]) return; seen[k] = true;
    out.push({ id:'c:'+k, text:c, source:'commish', by:null });
  });
  if(INCLUDE_SURVEY1_IDEAS){
    (intakeResponses||[]).forEach(function(r){
      var c = clean(r.punishment); if(!c) return;
      var k = norm(c); if(seen[k]) return; seen[k] = true;
      out.push({ id:'s:'+k, text:c, source:'survey1', by:r.name });
    });
  }
  Object.keys(s2||{}).forEach(function(n){
    var c = clean(s2[n] && s2[n].punishWrite); if(!c) return;
    var k = norm(c); if(seen[k]) return; seen[k] = true;
    out.push({ id:'w:'+k, text:c, source:'writein', by:n });
  });
  return out;
}
function ballotById(ballot, id){
  for(var i=0;i<ballot.length;i++){ if(ballot[i].id === id) return ballot[i]; }
  return null;
}

/* Ranked-choice tally: 1st = PODIUM_SIZE pts down to 1. */
function punishmentTally(s2, ballot){
  var scores = {};
  Object.keys(s2||{}).forEach(function(n){
    var r = s2[n];
    (r.podium||[]).forEach(function(id, idx){
      var o = ballotById(ballot, id); if(!o) return;
      var k = norm(o.text);
      if(!scores[k]) scores[k] = { text:o.text, pts:0, firsts:0, voters:[] };
      scores[k].pts += (PODIUM_SIZE - idx);
      if(idx === 0) scores[k].firsts++;
      scores[k].voters.push(r.name);
    });
  });
  return Object.keys(scores).map(function(k){ return scores[k]; })
    .sort(function(x,y){ return (y.pts-x.pts) || (y.firsts-x.firsts) || x.text.localeCompare(y.text); });
}
function targetTally(s2){
  var counts = {}, writeins = [];
  PUNISHMENT_TARGETS.forEach(function(t){ counts[t.id] = { id:t.id, label:t.label, n:0, voters:[] }; });
  Object.keys(s2||{}).forEach(function(n){
    var r = s2[n];
    if(r.targetVote === '__other'){
      if(clean(r.targetWrite)) writeins.push({ who:r.name, text:clean(r.targetWrite) });
      return;
    }
    if(counts[r.targetVote]){ counts[r.targetVote].n++; counts[r.targetVote].voters.push(r.name); }
  });
  return {
    rows: PUNISHMENT_TARGETS.map(function(t){ return counts[t.id]; }).sort(function(a,b){ return b.n-a.n; }),
    writeins: writeins
  };
}


/* ═════════════════════════════════════════════════════════════
   10. SHARED CHROME — banner, nav, PIN vault, toast
   ═════════════════════════════════════════════════════════════ */

/* nav: array of { label, href } or { label, onclick }, optionally active:true */
function renderBanner(o){
  var nav = (o.nav||[]).map(function(n){
    var attr = n.href ? 'onclick="location.href=\''+jsStr(n.href)+'\'"' : 'onclick="'+n.onclick+'"';
    return '<button class="commish-link '+(n.active?'active':'')+'" '+attr+'>'+esc(n.label)+'</button>';
  }).join('');
  return el(
    '<header class="banner"><div class="banner-inner">' +
      '<div class="stamp">OFFICIAL<br>LEAGUE DOC</div>' +
      '<div class="eyebrow-row">' +
        '<span class="league-tag">'+esc(o.tag||'THE DICKHEAD\'S LEAGUE')+'</span>' +
        '<div class="nav-btns">'+nav+'</div>' +
      '</div>' +
      '<h1 class="title display">'+(o.titleHtml || esc(o.title||''))+'</h1>' +
      '<p class="subtitle">'+esc(o.subtitle||'')+'</p>' +
    '</div></header>'
  );
}

/* Standard nav for a page. `me` is 'hub' | 'boards' | 'desk' | a survey id. */
function standardNav(me){
  var hubFile = (function(){
    // Before the September swap the hub lives at hub.html; after it, at the root.
    var intake = surveyById('intake');
    return (intake && intake.file === 'index.html') ? 'hub.html' : 'index.html';
  })();
  var nav = [];
  if(me !== 'hub')    nav.push({ label:'← LEAGUE HUB', href:hubFile });
  if(me !== 'boards') nav.push({ label:'🏆 BOARDS', href:'boards.html' });
  if(me !== 'desk')   nav.push({ label:"COMMISSIONER'S DESK →", href:'desk.html' });
  return nav;
}
function hubHref(){
  var intake = surveyById('intake');
  return (intake && intake.file === 'index.html') ? 'hub.html' : 'index.html';
}

/* ── PIN VAULT ── */
var PIN_FAIL_MSG = "The dickhead commissioner is free on Friday from 8–12, if you're ready for a hot date.";
var LeaguePin = {
  input:'', msg:'', shake:false, ok:false,
  onSuccess:null,       // set by the host page
  onRender:null,        // set by the host page
  cardHtml: function(backOnclick){
    var dots = [0,1,2,3].map(function(i){
      return '<span class="pin-dot '+(i<LeaguePin.input.length?'filled':'')+'"></span>';
    }).join('');
    var keys = ['1','2','3','4','5','6','7','8','9','','0','⌫'];
    var pad = keys.map(function(k){
      if(k === '') return '<span class="pin-key empty"></span>';
      if(k === '⌫') return '<button class="pin-key" onclick="LeaguePin.del()">⌫</button>';
      return '<button class="pin-key" onclick="LeaguePin.press(\''+k+'\')">'+k+'</button>';
    }).join('');
    return '' +
      '<div class="card pin-card '+(LeaguePin.shake?'shake':'')+'">' +
        '<div class="pin-icon">🔒</div>' +
        '<h2 class="pin-title">Commissioner\'s Vault</h2>' +
        '<p class="pin-sub">Four-digit code that only the dickhead commissioner knows. Maybe if you go on a date with him he might let it slip.</p>' +
        '<div class="pin-dots">'+dots+'</div>' +
        (LeaguePin.msg
          ? '<p class="pin-msg show">'+esc(LeaguePin.msg)+'</p>'
          : '<p class="pin-msg placeholder">&nbsp;</p>') +
        '<div class="pin-pad">'+pad+'</div>' +
        (backOnclick ? '<span class="back-link" onclick="'+backOnclick+'">← Back</span>' : '') +
      '</div>';
  },
  press: function(d){
    if(LeaguePin.input.length >= 4) return;
    LeaguePin.input += d;
    if(LeaguePin.input.length === 4){
      if(LeaguePin.input === COMMISH_PIN){
        LeaguePin.ok = true; LeaguePin.msg = ''; LeaguePin.input = '';
        if(LeaguePin.onSuccess) LeaguePin.onSuccess();
        return;
      }
      LeaguePin.msg = PIN_FAIL_MSG; LeaguePin.input = ''; LeaguePin.shake = true;
    } else { LeaguePin.msg = ''; }
    if(LeaguePin.onRender) LeaguePin.onRender();
  },
  del: function(){
    LeaguePin.input = LeaguePin.input.slice(0,-1);
    LeaguePin.msg = '';
    if(LeaguePin.onRender) LeaguePin.onRender();
  }
};

/* ── TOAST ── */
var _toastTimer = null;
function showToast(msg, kind){
  var old = document.querySelector('.toast');
  if(old) old.remove();
  var t = document.createElement('div');
  t.className = 'toast ' + (kind||'');
  t.textContent = msg;
  document.body.appendChild(t);
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(function(){ if(t.parentNode) t.remove(); }, 2600);
}

function copyText(text, okMsg){
  function done(){ showToast(okMsg || 'Copied', 'good'); }
  if(navigator.clipboard && navigator.clipboard.writeText){
    navigator.clipboard.writeText(text).then(done).catch(function(){ fallbackCopy(text, done); });
  } else fallbackCopy(text, done);
}
function fallbackCopy(text, cb){
  var ta = document.createElement('textarea');
  ta.value = text; ta.style.position='fixed'; ta.style.opacity='0';
  document.body.appendChild(ta); ta.select();
  try{ document.execCommand('copy'); cb(); }
  catch(e){ showToast('Copy failed — the link is this page’s URL','bad'); }
  document.body.removeChild(ta);
}


/* ═════════════════════════════════════════════════════════════
   11. DRAG-TO-REORDER (pointer events — mouse + touch)
   ═════════════════════════════════════════════════════════════
   Host page sets LEAGUE_HOOKS.dragCommit(listKey, ids) and .render(). */

var LEAGUE_HOOKS = { dragCommit:null, render:null };
var dragCtx = null;

/* FLIP: capture positions + colours before a render, animate after. */
function captureFlip(){
  var map = {};
  document.querySelectorAll('.drag-row').forEach(function(r){
    var id = r.getAttribute('data-id');
    var rect = r.getBoundingClientRect();
    map[id] = { top: rect.top, bg: getComputedStyle(r).backgroundColor };
  });
  return map;
}
function playFlip(prev, movedId){
  document.querySelectorAll('.drag-row').forEach(function(r){
    var id = r.getAttribute('data-id');
    var old = prev[id];
    if(!old) return;
    var rect = r.getBoundingClientRect();
    var dy = old.top - rect.top;
    var newBg = getComputedStyle(r).backgroundColor;

    r.style.transition = 'none';
    if(dy) r.style.transform = 'translateY('+dy+'px)';
    if(old.bg && old.bg !== newBg) r.style.backgroundColor = old.bg;
    void r.offsetHeight;                        // commit the start state

    requestAnimationFrame(function(){
      r.style.transition = 'transform .28s cubic-bezier(.2,.7,.3,1), background-color .5s ease';
      r.style.transform = 'translateY(0)';
      if(old.bg && old.bg !== newBg) r.style.backgroundColor = newBg;
      if(id === movedId) r.classList.add('row-pop');
    });
  });
}

function startDrag(e, listKey){
  if(dragCtx) return;                 // ignore a second pointer mid-drag
  e.preventDefault();
  var row = e.currentTarget.closest('.drag-row');
  if(!row) return;
  var handle = e.currentTarget;
  try{ handle.setPointerCapture(e.pointerId); }catch(err){}
  row.style.transition = 'none';      // no easing while it tracks the finger
  row.classList.add('dragging');
  dragCtx = { row:row, handle:handle, listKey:listKey, pointerId:e.pointerId, baselineY:e.clientY };
  // Bound to window (not the handle) so tracking survives the pointer leaving
  // the small grip, and works even when pointer capture isn't granted.
  window.addEventListener('pointermove', onDragMove, { passive:false });
  window.addEventListener('pointerup', onDragEnd);
  window.addEventListener('pointercancel', onDragEnd);
}

function onDragMove(e){
  if(!dragCtx || e.pointerId !== dragCtx.pointerId) return;
  e.preventDefault();                 // stop the page scrolling under a touch drag
  var row = dragCtx.row;
  var list = row.parentElement;

  // 1) follow the cursor continuously
  row.style.transform = 'translateY('+(e.clientY - dragCtx.baselineY)+'px)';

  // 2) where should it sit? allow jumping past several rows at once
  var allRows = Array.prototype.slice.call(list.querySelectorAll('.drag-row'));
  var currentIndex = allRows.indexOf(row);
  var rowRect = row.getBoundingClientRect();
  var rowCenter = rowRect.top + rowRect.height / 2;

  var desired = 0;
  allRows.forEach(function(other){
    if(other === row) return;
    var r = other.getBoundingClientRect();
    if(rowCenter > r.top + r.height / 2) desired++;
  });
  if(desired === currentIndex) return;

  // 3) move the DOM node
  var others = allRows.filter(function(r){ return r !== row; });
  var anchor = others[desired];
  var beforeTop = rowRect.top;
  if(anchor) list.insertBefore(row, anchor);
  else others[others.length - 1].after(row);

  // 4) FLIP-pin: keep the row visually under the cursor across the DOM move
  row.style.transform = 'none';
  var afterTop = row.getBoundingClientRect().top;
  var delta = beforeTop - afterTop;
  row.style.transform = 'translateY('+delta+'px)';
  dragCtx.baselineY = e.clientY - delta;
}

function onDragEnd(e){
  if(!dragCtx || (e.pointerId !== undefined && e.pointerId !== dragCtx.pointerId)) return;
  var row = dragCtx.row, handle = dragCtx.handle, listKey = dragCtx.listKey, pointerId = dragCtx.pointerId;
  window.removeEventListener('pointermove', onDragMove, { passive:false });
  window.removeEventListener('pointerup', onDragEnd);
  window.removeEventListener('pointercancel', onDragEnd);
  row.classList.remove('dragging');
  row.style.transform = '';
  try{ handle.releasePointerCapture(pointerId); }catch(err){}

  var list = row.parentElement;
  var ids = Array.prototype.slice.call(list.querySelectorAll('.drag-row'))
    .map(function(r){ return r.getAttribute('data-id'); });

  dragCtx = null;
  if(LEAGUE_HOOKS.dragCommit) LEAGUE_HOOKS.dragCommit(listKey, ids);
  var prev = captureFlip();
  if(LEAGUE_HOOKS.render) LEAGUE_HOOKS.render();
  playFlip(prev, null);
}


/* ═════════════════════════════════════════════════════════════
   12. SURVEY 1 AGGREGATION
   ═════════════════════════════════════════════════════════════
   Lifted verbatim from the original commissioner's view so the public
   boards and the desk compute identical numbers from one implementation. */

function buyInTally(responses){
  var counts = {}; BUYINS.forEach(function(b){ counts[b] = 0; });
  responses.forEach(function(r){ if(counts[r.buyIn] !== undefined) counts[r.buyIn]++; });
  var max = Math.max.apply(null, [1].concat(BUYINS.map(function(b){ return counts[b]; })));
  var leading = '', best = -1;
  BUYINS.forEach(function(b){ if(counts[b] > best){ best = counts[b]; leading = b; } });
  return { counts:counts, max:max, leading:leading, leadingCount:best, pot: best > 0 ? potTotal(leading) : 0 };
}

/* Average the proposed distribution across everyone who expressed a
   preference (unfunded places count as 0%). */
function prizeAggregate(responses){
  var plans = responses.map(function(r){ return r.prizePlan; })
                       .filter(function(p){ return p && Array.isArray(p.places); });
  var noPrefCount = responses.filter(function(r){ return ('prizePlan' in r) && r.prizePlan === null; }).length;
  var maxPlaces = plans.reduce(function(m,p){ return Math.max(m, p.places.length); }, 0);
  var placeAvgPct = [];
  for(var i=0;i<maxPlaces;i++){
    var sum = plans.reduce(function(a,p){ return a + (p.places[i]||0); }, 0);
    placeAvgPct.push(plans.length ? sum/plans.length : 0);
  }
  var regAdopters = plans.filter(function(p){ return (p.regSeason||0) > 0; });
  var regAvgAll = plans.length ? plans.reduce(function(a,p){ return a + (p.regSeason||0); }, 0)/plans.length : 0;
  var avgPlaceCount = plans.length
    ? plans.reduce(function(a,p){ return a + p.places.filter(function(x){ return x>0; }).length; }, 0)/plans.length
    : 0;
  return { plans:plans, noPrefCount:noPrefCount, placeAvgPct:placeAvgPct,
           regAdopters:regAdopters, regAvgAll:regAvgAll, avgPlaceCount:avgPlaceCount };
}

function weekendStats(responses){
  var stats = WEEKENDS.map(function(wk){
    var dayIds = wk.days.map(function(d){ return d.id; });
    var ranks = [], fullyOut = 0, inPersonCount = 0, virtualCount = 0;
    var dayOut = {}; wk.days.forEach(function(d){ dayOut[d.id] = 0; });
    responses.forEach(function(r){
      var cm = r.cantMake || {};
      wk.days.forEach(function(d){ if(cm[d.id]) dayOut[d.id]++; });
      var allOut = dayIds.every(function(id){ return cm[id]; });
      if(allOut){ fullyOut++; return; }
      var idx = (r.weekendOrder||[]).indexOf(wk.id);
      if(idx >= 0) ranks.push(idx+1);
      if(r.locality === 'oot'){
        if(r.inPerson && r.inPerson[wk.id] === false) virtualCount++; else inPersonCount++;
      }
    });
    var avg = ranks.length ? (ranks.reduce(function(a,b){ return a+b; },0)/ranks.length) : null;
    return { wk:wk, avg:avg, available:ranks.length, fullyOut:fullyOut,
             dayOut:dayOut, inPersonCount:inPersonCount, virtualCount:virtualCount };
  });
  var ranked = stats.filter(function(s){ return s.avg !== null; }).sort(function(a,b){ return a.avg - b.avg; });
  return { stats:stats, ranked:ranked, best: ranked.length ? ranked[0] : null };
}

/* The single best day across all weekends: fewest people unavailable, then
   best-ranked weekend. This is what "Draft Day" leads with. */
function bestDraftDay(responses){
  var ws = weekendStats(responses);
  var rank = {};
  ws.ranked.forEach(function(s,i){ rank[s.wk.id] = i; });
  var cands = [];
  ws.stats.forEach(function(s){
    if(s.avg === null) return;
    s.wk.days.forEach(function(d){
      cands.push({ day:d, wk:s.wk, out:s.dayOut[d.id]||0, wkRank: rank[s.wk.id] === undefined ? 99 : rank[s.wk.id] });
    });
  });
  cands.sort(function(a,b){ return (a.out - b.out) || (a.wkRank - b.wkRank); });
  return cands.length ? cands[0] : null;
}
