-- Migration 010: player's name in Marathi (Devanagari)
--
-- Filled in automatically from the English name at registration (and editable),
-- and printed on the गुणपत्रिका score sheets and results.
--
-- Ages are now always counted on 31 December of the competition year, so
-- competitions.age_reference_date is no longer used (the column is left in place).
--
-- Safe to re-run.

USE mallakhamb_competition;

ALTER TABLE players
    ADD COLUMN IF NOT EXISTS name_marathi VARCHAR(150) NULL AFTER last_name;
