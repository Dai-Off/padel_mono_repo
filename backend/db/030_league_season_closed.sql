-- 030_league_season_closed.sql
-- Ensure closed flag exists and has deterministic default.

alter table if exists league_seasons
  add column if not exists closed boolean not null default false;
