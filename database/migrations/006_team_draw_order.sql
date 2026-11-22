-- Migration 006: team-level lottery order
--
-- The lottery page draws an order for the TEAMS in a competition. A team's drawn
-- position belongs to its registration, so it lives on competition_registrations
-- rather than in a new table.
--
-- The existing lottery_draws / performance_sequences tables are untouched: those
-- order individual player entries within one category and are still used by the
-- performance schedule.

USE mallakhamb_competition;

ALTER TABLE competition_registrations
    ADD COLUMN draw_order INT NULL AFTER status,
    ADD COLUMN draw_conducted_at TIMESTAMP NULL AFTER draw_order;

-- Two teams in the same competition cannot hold the same drawn position.
-- Repeated NULLs are allowed, so undrawn registrations are unaffected.
ALTER TABLE competition_registrations
    ADD UNIQUE KEY unique_competition_draw_order (competition_id, draw_order);
