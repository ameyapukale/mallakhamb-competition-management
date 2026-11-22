-- Migration 013: date of birth is optional for players entered by the admin
--
-- Club lists often give only the age group, not the date of birth. Such
-- players keep the age group the admin chose (players.age_group_id); players
-- with a date of birth are still placed automatically from it.
-- Public registration still requires the date of birth.
--
-- Safe to re-run.

USE mallakhamb_competition;

ALTER TABLE players
    MODIFY COLUMN date_of_birth DATE NULL;
