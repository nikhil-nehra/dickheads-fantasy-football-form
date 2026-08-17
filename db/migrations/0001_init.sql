-- ═══════════════════════════════════════════════════════════════════════════
--  0001_init — the whole league
-- ═══════════════════════════════════════════════════════════════════════════
--  Design rule: a survey's DEFINITION is code (src/lib/surveys/*.ts), a
--  survey's STATE is data (this database). That split is inherited from the
--  old site's single best idea — status lived in the Sheet so the
--  commissioner could open and close things from a phone without git.
--
--  Everything the old implementation held up with comments and conventions is
--  a constraint here instead. See the notes on each table.
-- ═══════════════════════════════════════════════════════════════════════════

PRAGMA foreign_keys = ON;

-- ── Players ────────────────────────────────────────────────────────────────
--  `id` is a stable slug that never changes. `display_name` is just a label.
--  The old site keyed every row by display name, so renaming anyone orphaned
--  their data ("Pranav Chelat", "Mattew Yoshida") and needed an "Off the
--  roster" UI to stop those rows vanishing silently. That class of bug cannot
--  occur here.
CREATE TABLE player (
  id                TEXT    PRIMARY KEY,
  display_name      TEXT    NOT NULL,
  sleeper_user_id   TEXT    UNIQUE,
  sleeper_roster_id INTEGER,
  is_commissioner   INTEGER NOT NULL DEFAULT 0 CHECK (is_commissioner IN (0,1)),
  active            INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  sort_order        INTEGER NOT NULL DEFAULT 0,
  created_at        TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_player_active ON player(active, sort_order);

-- ── Surveys ────────────────────────────────────────────────────────────────
--  One row per survey id declared in src/lib/surveys/. Holds ONLY mutable
--  runtime state. A CHECK constraint replaces the old client-side status
--  string that failed open in the browser and closed on the server.
CREATE TABLE survey (
  id         TEXT PRIMARY KEY,
  status     TEXT NOT NULL DEFAULT 'draft'
             CHECK (status IN ('draft','open','closed','archived')),
  closes_at  TEXT,
  changed_at TEXT NOT NULL DEFAULT (datetime('now')),
  changed_by TEXT
);

-- ── Responses ──────────────────────────────────────────────────────────────
--  `answers` is JSON, but validated against the survey definition's derived
--  schema before it ever reaches this table — unlike the old store, which
--  wrote the value verbatim and silently dropped anything unparseable at
--  render time.
CREATE TABLE response (
  survey_id  TEXT NOT NULL REFERENCES survey(id) ON DELETE CASCADE,
  player_id  TEXT NOT NULL REFERENCES player(id) ON DELETE CASCADE,
  answers    TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (survey_id, player_id)
);
CREATE INDEX idx_response_survey ON response(survey_id);

-- ── Ballot options ─────────────────────────────────────────────────────────
--  The crowd-sourced punishment pool. Option ids are stable and opaque.
--  The old site derived option ids from a normalisation of the option TEXT
--  ('s:' + norm), so editing a punishment silently invalidated every stored
--  ranking that referenced it and the UI rendered "(removed option)".
--  Dedupe is now a UNIQUE constraint on normalised text, not a client-side
--  pass over everyone's rows.
CREATE TABLE ballot_option (
  id           TEXT NOT NULL PRIMARY KEY,
  survey_id    TEXT NOT NULL REFERENCES survey(id) ON DELETE CASCADE,
  question_id  TEXT NOT NULL,
  text         TEXT NOT NULL,
  norm_text    TEXT NOT NULL,
  source       TEXT NOT NULL CHECK (source IN ('commissioner','imported','writein')),
  suggested_by TEXT REFERENCES player(id) ON DELETE SET NULL,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (survey_id, question_id, norm_text)
);
CREATE INDEX idx_ballot_option_q ON ballot_option(survey_id, question_id);

-- ── Pairings ───────────────────────────────────────────────────────────────
--  The UNIQUE constraints enforce what the old site could only warn about
--  from the Desk: nobody appears in two pairings in a season.
CREATE TABLE pairing (
  id          TEXT NOT NULL PRIMARY KEY,
  season      TEXT NOT NULL,
  a_player_id TEXT NOT NULL REFERENCES player(id) ON DELETE CASCADE,
  b_player_id TEXT NOT NULL REFERENCES player(id) ON DELETE CASCADE,
  source      TEXT NOT NULL DEFAULT 'manual'
              CHECK (source IN ('manual','sleeper','auto')),
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (season, a_player_id),
  UNIQUE (season, b_player_id),
  CHECK (a_player_id <> b_player_id)
);

-- ── Negotiation ────────────────────────────────────────────────────────────
--  THE important table. One row per (pairing, field, player) means "each
--  player only ever writes their own row" is a PRIMARY KEY rather than a
--  convention held up by a comment. There is no contended row, so there is no
--  lock to win and no race to lose.
--
--  Agreement is DERIVED by comparing the two rows — never stored. That was
--  the old implementation's best decision and it is preserved exactly.
CREATE TABLE negotiation_entry (
  pairing_id TEXT NOT NULL REFERENCES pairing(id) ON DELETE CASCADE,
  field_key  TEXT NOT NULL,
  player_id  TEXT NOT NULL REFERENCES player(id) ON DELETE CASCADE,
  proposal   TEXT,
  pick       TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (pairing_id, field_key, player_id)
);

-- ── Commissioner rulings ───────────────────────────────────────────────────
--  Overrides a stalled negotiation line. One row per (pairing, field), so two
--  simultaneous rulings upsert instead of clobbering a shared JSON blob.
CREATE TABLE ruling (
  pairing_id TEXT NOT NULL REFERENCES pairing(id) ON DELETE CASCADE,
  field_key  TEXT NOT NULL,
  value      TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (pairing_id, field_key)
);

-- ── Audit ──────────────────────────────────────────────────────────────────
--  The old site recorded a client-supplied `changedAt` and nothing else, so
--  who closed a survey or forced a ruling was unknowable.
CREATE TABLE audit_log (
  id     INTEGER PRIMARY KEY AUTOINCREMENT,
  at     TEXT NOT NULL DEFAULT (datetime('now')),
  actor  TEXT,
  action TEXT NOT NULL,
  detail TEXT
);
CREATE INDEX idx_audit_at ON audit_log(at DESC);

-- ── Sleeper snapshots ──────────────────────────────────────────────────────
--  Written only by workers/sleeper-sync. The app reads from here and never
--  calls Sleeper on a request path, so page loads carry no third-party
--  latency and no rate-limit exposure.
CREATE TABLE sleeper_cache (
  key        TEXT PRIMARY KEY,
  payload    TEXT NOT NULL,
  fetched_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ── Rate limiting ──────────────────────────────────────────────────────────
--  Fixed-window counters. The old public endpoint had none, so anyone could
--  append unlimited arbitrary rows to the commissioner's spreadsheet.
CREATE TABLE rate_limit (
  bucket     TEXT PRIMARY KEY,
  hits       INTEGER NOT NULL DEFAULT 0,
  expires_at INTEGER NOT NULL
);
CREATE INDEX idx_rate_limit_expiry ON rate_limit(expires_at);
