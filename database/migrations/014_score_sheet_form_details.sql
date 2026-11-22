-- Migration 014: free text written on the printed score sheet
--
-- Everything on the paper form can be filled in or corrected per sheet:
-- team name, वयोगट, मुले/मुली, apparatus, date, स्पर्धा क्र. and the names of
-- the judges and officials. Stored as JSON text; empty means "use the
-- competition's own value". It never changes teams, age groups or players.
--
-- Safe to re-run.

USE mallakhamb_competition;

ALTER TABLE score_sheets
    ADD COLUMN IF NOT EXISTS form_details TEXT NULL AFTER remarks;
