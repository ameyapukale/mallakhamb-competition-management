-- Migration 009: boys / girls age groups, and "best N players" team scoring
--
-- 1. Every player now gives a gender (male / female) at registration.
-- 2. Each age group is for Boys, Girls or Mixed. A player lands in the group whose
--    age range fits their age AND whose gender is theirs (or Mixed). Boys and Girls
--    groups may therefore cover the same ages, with different apparatus.
-- 3. competitions.team_best_count: when set, a team's score on a sheet (संघिक गुण)
--    counts only its best N final scores. NULL = every player counts.
--
-- Safe to re-run.

USE mallakhamb_competition;

ALTER TABLE age_groups
    ADD COLUMN IF NOT EXISTS gender ENUM('male', 'female', 'mixed') NOT NULL DEFAULT 'mixed' AFTER max_age;

ALTER TABLE competitions
    ADD COLUMN IF NOT EXISTS team_best_count INT NULL AFTER max_players_per_team;
