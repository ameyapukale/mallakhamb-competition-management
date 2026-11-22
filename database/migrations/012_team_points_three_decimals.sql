-- Migration 012: keep team points (संघिक गुण) to three decimals
--
-- Final scores have three decimals (e.g. 8.033), so their sum needs three too;
-- with two it was cut short (8.033 -> 8.03).
--
-- Safe to re-run.

USE mallakhamb_competition;

ALTER TABLE score_sheets
    MODIFY COLUMN team_points DECIMAL(9,3) NULL;
