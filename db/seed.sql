-- ═══════════════════════════════════════════════════════════════════════════
--  seed — the 2026 roster and the two surveys
-- ═══════════════════════════════════════════════════════════════════════════
--  Safe to re-run: every statement is an upsert.
--
--  Player ids are stable slugs and must NEVER be edited once anyone has
--  responded. Display names can be changed freely at any time — that is the
--  whole point of separating them.
--
--  `sleeper_user_id` is left NULL here. The sync worker fills it in only on an
--  EXACT name match, which in this league matches nobody — everyone's handle is
--  something like pdande97, scomeaux11 or LyanRatin. Do the linking on the
--  Commissioner's Desk → Sleeper tab, which suggests a match per player from
--  the handle and team name and lets you confirm or override each one.
-- ═══════════════════════════════════════════════════════════════════════════

INSERT INTO player (id, display_name, is_commissioner, sort_order) VALUES
  ('nikhil-nehra',    'Nikhil Nehra',    1,  0),
  ('ryan-latin',      'Ryan Latin',      0,  1),
  ('lyon-burns',      'Lyon Burns',      0,  2),
  ('aidan-duncan',    'Aidan Duncan',    0,  3),
  ('stephen-comeaux', 'Stephen Comeaux', 0,  4),
  ('jaswin-jabbal',   'Jaswin Jabbal',   0,  5),
  ('dhruv-nandwani',  'Dhruv Nandwani',  0,  6),
  ('sean-vargeese',   'Sean Vargeese',   0,  7),
  ('shishir-nambi',   'Shishir Nambi',   0,  8),
  ('matthew-yoshida', 'Matthew Yoshida', 0,  9),
  ('samay-mohapatra', 'Samay Mohapatra', 0, 10),
  ('prabhas-dande',   'Prabhas Dande',   0, 11),
  ('david-moton',     'David Moton',     0, 12),
  ('rayyan-ali',      'Rayyan Ali',      0, 13)
ON CONFLICT(id) DO UPDATE SET
  display_name    = excluded.display_name,
  is_commissioner = excluded.is_commissioner,
  sort_order      = excluded.sort_order;

-- Both surveys start as 'draft' — hidden from the hub, writes blocked.
-- Open them from the Commissioner's Desk when you're ready, not from git.
INSERT INTO survey (id, status) VALUES
  ('intake',  'draft'),
  ('rivalry', 'draft')
ON CONFLICT(id) DO NOTHING;
