// Age groups carry the gender in their name — "U12 Boys", "A16 Girls", "Master".
// There is no gender column, so the name is what decides who may sit in a group.

/**
 * The gender an age group is restricted to, or null when it takes anyone
 * (e.g. "Master", which names no gender).
 */
const genderOfAgeGroup = (groupName) => {
  const name = String(groupName || '').toLowerCase();
  if (/\bgirls?\b|\bwomen\b|\bfemale\b/.test(name)) return 'female';
  if (/\bboys?\b|\bmen\b|\bmale\b/.test(name)) return 'male';
  return null;
};

/** Can a player of this gender be placed in this age group? */
const genderFitsAgeGroup = (playerGender, groupName) => {
  const required = genderOfAgeGroup(groupName);
  if (required === null) return true;      // open group
  if (!playerGender) return true;          // nothing to contradict
  return playerGender === required;
};

/**
 * Pick the age group for a date of birth, honouring gender so a boy is never
 * filed under a Girls group. Prefers a group naming the player's gender; falls
 * back to an open group of the right age when no gendered one matches.
 */
const resolveAgeGroup = async (pool, dateOfBirth, gender) => {
  if (!dateOfBirth) return null;

  const today = new Date();
  const birthDate = new Date(dateOfBirth);
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }

  const [groups] = await pool.execute(
    `SELECT id, group_name FROM age_groups
     WHERE min_age <= ? AND max_age >= ? AND is_active = TRUE
     ORDER BY (max_age - min_age), min_age`,
    [age, age]
  );

  if (groups.length === 0) return null;

  const gendered = groups.find((g) => genderOfAgeGroup(g.group_name) === gender);
  if (gendered) return gendered.id;

  const open = groups.find((g) => genderOfAgeGroup(g.group_name) === null);
  if (open) return open.id;

  // Only groups for the other gender fit this age — leave it unset rather than
  // filing the player somewhere they cannot compete.
  return null;
};

/**
 * Validate an explicit age group choice against a gender.
 * Returns null when fine, or a message explaining the clash.
 */
const checkAgeGroupGender = async (pool, ageGroupId, gender) => {
  if (!ageGroupId || !gender) return null;

  const [groups] = await pool.execute(
    'SELECT group_name FROM age_groups WHERE id = ?',
    [ageGroupId]
  );

  if (groups.length === 0) return 'That age group does not exist';

  const groupName = groups[0].group_name.trim();
  if (genderFitsAgeGroup(gender, groupName)) return null;

  const required = genderOfAgeGroup(groupName);
  return `A ${gender} player cannot be placed in "${groupName}" — that group is for ${required} players`;
};

module.exports = {
  genderOfAgeGroup,
  genderFitsAgeGroup,
  resolveAgeGroup,
  checkAgeGroupGender
};
