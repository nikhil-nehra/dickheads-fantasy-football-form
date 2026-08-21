-- ═══════════════════════════════════════════════════════════════════════════
--  0002_pot — the buy-in, the payout split, and who has actually paid
-- ═══════════════════════════════════════════════════════════════════════════
--  The Pot board used to derive the buy-in and split from the intake survey
--  and print the vote counts beside them. That made a board out of a survey
--  readout: the numbers moved every time somebody answered, and the answers
--  themselves — which belong on the Desk — were shipped to every visitor to
--  draw the bars.
--
--  The buy-in and the split are decisions, not tallies. The survey informs
--  them; it does not *be* them. So they live here, set once from the Desk, the
--  same way survey status does — changeable from a phone, no git.
--
--  Payment is the same kind of fact. Sleeper does have a League Dues Tracker,
--  but reading it needs an account-wide token on a Worker secret that silently
--  expires; the Desk is one place, needs no credential, and cannot go stale
--  without somebody noticing.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE pot_config (
  season     TEXT PRIMARY KEY,
  -- Whole dollars. Nobody has ever proposed a $52.50 buy-in.
  buy_in     INTEGER NOT NULL DEFAULT 0 CHECK (buy_in >= 0),
  -- JSON array of {label, pct}. Validated against src/lib/pot.ts before it is
  -- written — the CHECK below only stops the shape being wrong outright.
  split      TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(split)),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_by TEXT
);

-- ── Who has paid ───────────────────────────────────────────────────────────
--  One row per (season, player), so marking two people paid at the same time
--  is two independent upserts rather than a contended JSON blob. That is the
--  same rule the rest of this schema follows, and for the same reason: the old
--  site's worst bugs were both read-modify-write races run from a phone.
--
--  A missing row means "not paid", so nothing has to be seeded when a season
--  starts and a new player is simply unpaid the moment they are added.
CREATE TABLE payment (
  season    TEXT    NOT NULL,
  player_id TEXT    NOT NULL REFERENCES player(id) ON DELETE CASCADE,
  paid      INTEGER NOT NULL DEFAULT 0 CHECK (paid IN (0,1)),
  -- When it was marked, not when the money moved — the Desk cannot know that.
  marked_at TEXT    NOT NULL DEFAULT (datetime('now')),
  marked_by TEXT,
  PRIMARY KEY (season, player_id)
);
CREATE INDEX idx_payment_season ON payment(season, paid);
