-- ═══════════════════════════════════════════════════════════════════════════
--  0003_punishment — the sentence, the victim, the deadline, the rules
-- ═══════════════════════════════════════════════════════════════════════════
--  The same correction 0002 made to The Pot, made to The Punishment.
--
--  The board published a live ballot: points moving every time somebody voted,
--  a victim column that changed under the reader, and a "12 of you haven't
--  filled this in" roast. That is a survey readout, not a board. Nobody serves
--  a punishment that is still being counted.
--
--  The vote still decides it — the ranked ballot is on the Desk, where the
--  commissioner reads it — but what the league is HELD TO is a ruling somebody
--  made and can be quoted on. So it is set once, from a phone, and printed as
--  a fact.
--
--  Two of these four the survey has an opinion about (the punishment and the
--  victim) and two it has never asked (by when, and how exactly it is to be
--  done). All four are stored the same way, because the board makes no
--  distinction between them: they are equally the ruling.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE punishment_config (
  season       TEXT PRIMARY KEY,
  -- The sentence itself, in the commissioner's words. Usually the ballot
  -- winner copied across, but not necessarily — the vote advises, the
  -- commissioner rules, and a tie has to be broken by somebody.
  punishment   TEXT NOT NULL DEFAULT '',
  -- Who serves it. Free text rather than a player id on purpose: the answer is
  -- often a RULE ("last place, toilet bowl") months before it is a person, and
  -- storing it as a player id would mean either leaving it empty all season or
  -- guessing at a name from standings that are not final.
  victim       TEXT NOT NULL DEFAULT '',
  -- When it has to be done by. Text, not a date: the deadline the league
  -- actually agreed is "the Super Bowl", and pinning that to a timestamp would
  -- invent a precision nobody voted for. Seeded with it because that is the
  -- standing rule, not because it cannot be changed.
  deadline     TEXT NOT NULL DEFAULT 'The Super Bowl',
  -- How it is to be done, and what counts as proof. The part the survey never
  -- asks about and every January argument is actually about.
  instructions TEXT NOT NULL DEFAULT '',
  updated_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_by   TEXT
);
