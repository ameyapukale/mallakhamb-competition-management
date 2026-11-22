-- Migration 011: open-ended age groups
--
-- An age group may leave out its minimum age ("Under 10" = up to 9) or its
-- maximum age ("18 and above"). NULL means "no limit on that side".
--
-- Safe to re-run.

USE mallakhamb_competition;

ALTER TABLE age_groups
    MODIFY COLUMN min_age INT NULL,
    MODIFY COLUMN max_age INT NULL;
