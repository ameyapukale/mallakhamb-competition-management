-- Migration 008: simplified flow — public team registration, per-competition age groups
--
-- The new flow:
--   1. The admin is the only login. While creating a competition the admin lists its
--      age groups (name + min/max age) and which apparatus (pole / rope / hanging)
--      each age group competes on.
--   2. The public landing page lists competitions; anyone can "Register your team"
--      with a team name and players (name + date of birth). The player's age group
--      is decided from the date of birth.
--   3. Score sheets are generated per age group x apparatus x team, and results
--      (individual, team, age-group rankings) are calculated from them live.
--
-- Mapping onto the existing tables:
--   age group + apparatus  -> competition_categories (unchanged)
--   registered team        -> teams + competition_registrations (manager_id NULL)
--   player                 -> players (gender / category no longer collected)
--   player in a category   -> competition_entries
--   score sheet            -> score_sheets + score_sheet_entries (unchanged)
--
-- Safe to re-run: every change uses IF NOT EXISTS or is a MODIFY.

USE mallakhamb_competition;

-- -----------------------------------------------------------------
-- 1. Age groups belong to a competition
-- -----------------------------------------------------------------
-- Rows with competition_id NULL are the old global list; they are left alone and
-- simply not used by the new screens.
ALTER TABLE age_groups
    ADD COLUMN IF NOT EXISTS competition_id INT NULL AFTER id,
    ADD COLUMN IF NOT EXISTS sort_order INT NOT NULL DEFAULT 0 AFTER max_age;

ALTER TABLE age_groups
    ADD CONSTRAINT fk_age_groups_competition
        FOREIGN KEY IF NOT EXISTS (competition_id) REFERENCES competitions(id) ON DELETE CASCADE;

-- -----------------------------------------------------------------
-- 2. Competitions: age is worked out on a reference date
-- -----------------------------------------------------------------
-- NULL means "use start_date". Registration dates become optional because the
-- admin now opens and closes registration with the status instead.
ALTER TABLE competitions
    ADD COLUMN IF NOT EXISTS age_reference_date DATE NULL AFTER end_date,
    MODIFY COLUMN registration_start_date DATE NULL,
    MODIFY COLUMN registration_end_date DATE NULL;

-- -----------------------------------------------------------------
-- 3. Players: only name and date of birth are collected
-- -----------------------------------------------------------------
ALTER TABLE players
    MODIFY COLUMN gender ENUM('male', 'female', 'other') NULL,
    MODIFY COLUMN category ENUM('pole', 'rope', 'hanging') NULL,
    MODIFY COLUMN last_name VARCHAR(50) NOT NULL DEFAULT '';
