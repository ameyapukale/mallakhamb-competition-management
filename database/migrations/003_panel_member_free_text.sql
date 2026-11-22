-- Migration 003: allow the Scorer and Time Keeper slots to hold a typed-in name
-- instead of a registered judge account.
--
-- A panel member is now identified EITHER by judge_id (a real user account) OR by
-- member_name (free text). Judge No. 1-5 still require a real account, because
-- those slots award scores and therefore need someone who can log in.

USE mallakhamb_competition;

ALTER TABLE panel_members
    MODIFY COLUMN judge_id INT NULL,
    ADD COLUMN member_name VARCHAR(100) NULL AFTER judge_id;

-- Exactly one of judge_id / member_name must be set
ALTER TABLE panel_members
    ADD CONSTRAINT chk_member_identity CHECK (
        (judge_id IS NOT NULL AND member_name IS NULL)
     OR (judge_id IS NULL AND member_name IS NOT NULL)
    );

-- Free text is only ever valid for the two non-scoring slots
ALTER TABLE panel_members
    ADD CONSTRAINT chk_free_text_slots CHECK (
        member_name IS NULL OR position IN ('scorer', 'time_keeper')
    );

-- Note: unique_panel_judge (panel_id, judge_id) no longer covers free-text members,
-- because MySQL/MariaDB unique keys permit repeated NULLs. Duplicate typed names on
-- one panel are rejected in judgePanel.routes.js instead.
