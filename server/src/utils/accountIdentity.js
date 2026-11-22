// Username and email are unique PER ROLE, so one person can hold several accounts
// (a judge account and a team_manager account under the same username and email).
//
// Ownership rows such as teams.manager_id point at whichever account happened to
// create the record. Without this helper, a person who creates a team under one
// account cannot see it after signing in under another — the team simply vanishes.
// Treat every account sharing a username and email as the same person.

const getPersonAccountIds = async (pool, user) => {
  if (!user) return [];

  const [rows] = await pool.execute(
    'SELECT id FROM users WHERE username = ? AND email = ?',
    [user.username, user.email]
  );

  const ids = rows.map((r) => r.id);
  return ids.includes(user.id) ? ids : [...ids, user.id];
};

/** Does this user own the record, under any of their accounts? Admins always do. */
const ownsRecord = (user, managerId, accountIds) => {
  if (user?.role === 'admin') return true;
  if (managerId === null || managerId === undefined) return false;
  return accountIds.includes(managerId);
};

module.exports = { getPersonAccountIds, ownsRecord };
