-- Migration 004: one person, one username/email, several roles
--
-- Previously username and email were each globally unique, so a person who both
-- judges and manages a team could not hold two accounts. Uniqueness now includes
-- role, so the same username and email may repeat once per role.
--
-- Consequence: a username no longer identifies a single account. auth.routes.js
-- verifies the password against every account sharing the username and asks the
-- user to pick a role when more than one matches.

USE mallakhamb_competition;

ALTER TABLE users
    DROP INDEX username,
    DROP INDEX email,
    ADD UNIQUE KEY unique_username_role (username, role),
    ADD UNIQUE KEY unique_email_role (email, role);

-- No separate index on username or email is needed: each composite key has the
-- column as its leftmost prefix, so lookups by username or email alone still use it.
