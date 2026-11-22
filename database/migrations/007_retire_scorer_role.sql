-- Migration 007: retire the 'scorer' account role
--
-- Scoring is now done by judges, so 'scorer' is no longer offered when registering
-- or when an admin edits a user. Existing scorer accounts become judges.
--
-- NOTE: the ENUM value is deliberately left in place. Dropping it would rewrite the
-- whole users table and break any row that still holds it; leaving it costs nothing
-- and keeps the migration reversible. The role is simply never selectable again.
--
-- NOTE: the panel POSITION called 'scorer' (गुणलेखक on the score sheet) is untouched.
-- That is a seat on a judging panel, not an account role.

USE mallakhamb_competition;

-- Username and email are unique per role, so a scorer whose owner already holds a
-- judge account cannot be converted — that would collide. Convert the rest and
-- leave any collision behind to be resolved by hand.
UPDATE users u
   JOIN (
     SELECT s.id
     FROM users s
     WHERE s.role = 'scorer'
       AND NOT EXISTS (
         SELECT 1 FROM (SELECT username, email FROM users WHERE role = 'judge') j
         WHERE j.username = s.username OR j.email = s.email
       )
   ) convertible ON convertible.id = u.id
   SET u.role = 'judge';
