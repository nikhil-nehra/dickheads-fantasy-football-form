-- Link seeded players to their Sleeper accounts.
-- Handles are usernames, not real names, so sleeper-sync name matching cannot
-- do this automatically. Idempotent: re-running sets the same values.

UPDATE player SET sleeper_user_id = '106919728723148800', sleeper_roster_id = 10 WHERE id = 'lyon-burns';
UPDATE player SET sleeper_user_id = '460577235980513280', sleeper_roster_id = 3 WHERE id = 'prabhas-dande';
UPDATE player SET sleeper_user_id = '734916240635731968', sleeper_roster_id = 12 WHERE id = 'shishir-nambi';
UPDATE player SET sleeper_user_id = '1151118725660151808', sleeper_roster_id = 5 WHERE id = 'rayyan-ali';
UPDATE player SET sleeper_user_id = '1262574738576781312', sleeper_roster_id = 1 WHERE id = 'nikhil-nehra';
UPDATE player SET sleeper_user_id = '1265036834350579712', sleeper_roster_id = 11 WHERE id = 'samay-mohapatra';
UPDATE player SET sleeper_user_id = '1279358875803328512', sleeper_roster_id = 7 WHERE id = 'ryan-latin';
UPDATE player SET sleeper_user_id = '1381371307655970816', sleeper_roster_id = 2 WHERE id = 'sean-vargeese';
UPDATE player SET sleeper_user_id = '1381395857307369472', sleeper_roster_id = 4 WHERE id = 'stephen-comeaux';
UPDATE player SET sleeper_user_id = '1381437515981950976', sleeper_roster_id = 6 WHERE id = 'aidan-duncan';
UPDATE player SET sleeper_user_id = '1382182662516539392', sleeper_roster_id = 8 WHERE id = 'matthew-yoshida';
UPDATE player SET sleeper_user_id = '1382447060392878080', sleeper_roster_id = 9 WHERE id = 'dhruv-nandwani';
UPDATE player SET sleeper_user_id = '1395106623080382464', sleeper_roster_id = 13 WHERE id = 'jaswin-jabbal';
