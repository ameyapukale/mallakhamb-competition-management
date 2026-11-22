// The simplified competition flow, kept in one place:
//
//   competition ── age groups (per competition) ── apparatus  => competition_categories
//   public team registration ── players (name + DOB)         => competition_entries
//   every age group x apparatus x team                       => one score sheet
//
// Everything that changes who sits in which category (registering a team, editing
// its players, editing the age groups) ends by calling rebuildEntries(), which
// re-derives each player's age group from their date of birth, fixes up the
// competition entries and then syncs the score sheets. Doing it in one function
// means the sheets can never drift from the registrations.

const { v4: uuidv4 } = require('uuid');
const { JUDGE_FIELDS, calculateTeamPoints } = require('./scoreSheet');

const APPARATUS = [
  { value: 'pole', label: 'Pole Mallakhamb' },
  { value: 'rope', label: 'Rope Mallakhamb' },
  { value: 'hanging', label: 'Hanging Mallakhamb' }
];
const APPARATUS_VALUES = APPARATUS.map((a) => a.value);

// Players are boys or girls; an age group is for boys, girls, or both (mixed).
const PLAYER_GENDERS = ['male', 'female'];
const GROUP_GENDERS = ['male', 'female', 'mixed'];
const GENDER_LABEL = { male: 'Boys', female: 'Girls', mixed: 'Mixed' };

// Thrown for anything the caller should show to the user as-is (400).
class SetupError extends Error {
  constructor(message) {
    super(message);
    this.name = 'SetupError';
    this.status = 400;
  }
}

// A row "has scores" once anything at all was typed into it. Such rows are never
// deleted implicitly — the change that would delete them is refused instead.
const SCORED_ROW_SQL = `(${[...JUDGE_FIELDS.map((f) => `sse.${f} IS NOT NULL`),
  'sse.deduction > 0', 'sse.performance_time IS NOT NULL'].join(' OR ')})`;

// ---------------------------------------------------------------------------
// Dates and ages
// ---------------------------------------------------------------------------

/** Split a DATE (JS Date from mysql2, or 'YYYY-MM-DD') into parts without TZ drift. */
const dateParts = (value) => {
  if (!value) return null;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return { y: value.getFullYear(), m: value.getMonth() + 1, d: value.getDate() };
  }
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value));
  if (!match) return null;
  const [y, m, d] = match.slice(1).map(Number);
  const check = new Date(y, m - 1, d);
  if (check.getFullYear() !== y || check.getMonth() !== m - 1 || check.getDate() !== d) return null;
  return { y, m, d };
};

const toYMD = (value) => {
  const p = dateParts(value);
  if (!p) return null;
  return `${p.y}-${String(p.m).padStart(2, '0')}-${String(p.d).padStart(2, '0')}`;
};

/** Completed years of age on the reference date. */
const ageOn = (dob, onDate) => {
  const b = dateParts(dob);
  const r = dateParts(onDate);
  if (!b || !r) return null;
  let age = r.y - b.y;
  if (r.m < b.m || (r.m === b.m && r.d < b.d)) age--;
  return age;
};

/**
 * The date ages are measured on: the date the admin chose, else 31 December of
 * the competition year (the year of its start date).
 */
const referenceDateOf = (competition) => {
  const chosen = toYMD(competition.age_reference_date);
  if (chosen) return chosen;
  const start = dateParts(competition.start_date) || dateParts(new Date());
  return `${start.y}-12-31`;
};

// An empty min or max age means "no limit on that side"
const isBlank = (v) => v === null || v === undefined || v === '';
const ageOrNull = (v) => (isBlank(v) ? null : Number(v));
const lowOf = (g) => (isBlank(g.min_age) ? -Infinity : Number(g.min_age));
const highOf = (g) => (isBlank(g.max_age) ? Infinity : Number(g.max_age));

/** "10–11", "up to 9", "18+", "any age" */
const rangeLabel = (g) => {
  const min = isBlank(g.min_age) ? null : g.min_age;
  const max = isBlank(g.max_age) ? null : g.max_age;
  if (min !== null && max !== null) return `${min}–${max}`;
  if (max !== null) return `up to ${max}`;
  if (min !== null) return `${min}+`;
  return 'any age';
};

/** The age group for this age and gender: its range fits and it is for that gender (or mixed). */
const findAgeGroup = (groups, age, gender) =>
  age === null ? null : groups.find((g) =>
    age >= lowOf(g) && age <= highOf(g) &&
    (g.gender === 'mixed' || g.gender === gender)) || null;

/** Two age groups clash when their ages overlap and a player could fit both. */
const gendersMeet = (a, b) => a === 'mixed' || b === 'mixed' || a === b;

const splitName = (fullName) => {
  const clean = String(fullName || '').trim().replace(/\s+/g, ' ');
  const space = clean.indexOf(' ');
  if (space === -1) return { first_name: clean, last_name: '' };
  return { first_name: clean.slice(0, space), last_name: clean.slice(space + 1) };
};

const fullName = (p) => [p.first_name, p.last_name].filter(Boolean).join(' ').trim();

// ---------------------------------------------------------------------------
// Loading
// ---------------------------------------------------------------------------

const loadCompetition = async (executor, competitionId) => {
  const [rows] = await executor.execute(
    'SELECT * FROM competitions WHERE id = ? AND is_active = TRUE',
    [competitionId]
  );
  return rows[0] || null;
};

/** The competition's age groups, each with its apparatus and category ids. */
const loadAgeGroups = async (executor, competitionId) => {
  const [groups] = await executor.execute(
    `SELECT id, group_name, min_age, max_age, gender, sort_order
     FROM age_groups WHERE competition_id = ?
     ORDER BY sort_order, min_age, id`,
    [competitionId]
  );
  const [categories] = await executor.execute(
    `SELECT id, age_group_id, category FROM competition_categories
     WHERE competition_id = ?`,
    [competitionId]
  );

  return groups.map((g) => {
    const own = categories.filter((c) => c.age_group_id === g.id);
    return {
      ...g,
      group_name: g.group_name.trim(),
      apparatus: APPARATUS_VALUES.filter((a) => own.some((c) => c.category === a)),
      categories: APPARATUS_VALUES
        .map((a) => own.find((c) => c.category === a))
        .filter(Boolean)
        .map((c) => ({ id: c.id, category: c.category }))
    };
  });
};

// ---------------------------------------------------------------------------
// Age group configuration (admin)
// ---------------------------------------------------------------------------

/** Returns an error message, or null when the list is usable. */
const validateAgeGroups = (list) => {
  if (!Array.isArray(list) || list.length === 0) {
    return 'Add at least one age group';
  }

  const names = new Set();
  for (const g of list) {
    const name = String(g.group_name || '').trim();
    if (!name) return 'Every age group needs a name';
    if (name.length > 50) return `Age group name "${name}" is too long (50 characters max)`;
    if (names.has(name.toLowerCase())) return `Age group "${name}" is listed twice`;
    names.add(name.toLowerCase());

    // Min and max are both optional (empty = no limit on that side)
    for (const field of ['min_age', 'max_age']) {
      if (isBlank(g[field])) continue;
      const n = Number(g[field]);
      if (!Number.isInteger(n) || n < 0 || n > 120) {
        return `"${name}": ages must be whole numbers between 0 and 120`;
      }
    }
    if (lowOf(g) > highOf(g)) return `"${name}": minimum age is above the maximum age`;
    if (!GROUP_GENDERS.includes(g.gender || 'mixed')) return `"${name}": choose Boys, Girls or Mixed`;

    const apparatus = Array.isArray(g.apparatus) ? g.apparatus : [];
    if (apparatus.length === 0) return `"${name}": pick at least one apparatus`;
    if (apparatus.some((a) => !APPARATUS_VALUES.includes(a))) return `"${name}": unknown apparatus`;
  }

  // Overlapping ranges for the same players would make "which age group is this
  // player in" ambiguous. Boys and Girls groups may share ages; Mixed clashes with both.
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const a = list[i];
      const b = list[j];
      const agesOverlap = lowOf(a) <= highOf(b) && lowOf(b) <= highOf(a);
      if (agesOverlap && gendersMeet(a.gender || 'mixed', b.gender || 'mixed')) {
        return `Age groups "${String(a.group_name).trim()}" and "${String(b.group_name).trim()}" overlap — a player must fit exactly one age group`;
      }
    }
  }
  return null;
};

/** Refuse to drop categories that already hold scores. */
const assertCategoriesUnscored = async (conn, categoryIds, what) => {
  if (categoryIds.length === 0) return;
  const [rows] = await conn.query(
    `SELECT COUNT(*) AS n FROM score_sheet_entries sse
     JOIN score_sheets ss ON sse.score_sheet_id = ss.id
     WHERE ss.competition_category_id IN (?) AND ${SCORED_ROW_SQL}`,
    [categoryIds]
  );
  if (rows[0].n > 0) {
    throw new SetupError(`Cannot remove ${what}: scores have already been entered for it. Clear those scores first.`);
  }
};

/**
 * Replace the competition's age groups with `list`. Items carrying an `id` update
 * that group; items without one are created; groups not in the list are removed.
 * Must run inside a transaction.
 */
const saveAgeGroups = async (conn, competitionId, list) => {
  const error = validateAgeGroups(list);
  if (error) throw new SetupError(error);

  const current = await loadAgeGroups(conn, competitionId);
  const currentById = new Map(current.map((g) => [g.id, g]));

  for (const g of list) {
    if (g.id && !currentById.has(Number(g.id))) {
      throw new SetupError('One of the age groups does not belong to this competition');
    }
  }

  // Removed groups
  const keptIds = new Set(list.filter((g) => g.id).map((g) => Number(g.id)));
  const removed = current.filter((g) => !keptIds.has(g.id));
  for (const g of removed) {
    await assertCategoriesUnscored(conn, g.categories.map((c) => c.id), `age group "${g.group_name}"`);
    await conn.execute('DELETE FROM age_groups WHERE id = ?', [g.id]); // cascades categories
  }

  for (let index = 0; index < list.length; index++) {
    const g = list[index];
    const name = String(g.group_name).trim();
    const gender = g.gender || 'mixed';
    let groupId = g.id ? Number(g.id) : null;

    if (groupId) {
      await conn.execute(
        'UPDATE age_groups SET group_name = ?, min_age = ?, max_age = ?, gender = ?, sort_order = ? WHERE id = ?',
        [name, ageOrNull(g.min_age), ageOrNull(g.max_age), gender, index, groupId]
      );
    } else {
      const [created] = await conn.execute(
        `INSERT INTO age_groups (competition_id, group_name, min_age, max_age, gender, sort_order)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [competitionId, name, ageOrNull(g.min_age), ageOrNull(g.max_age), gender, index]
      );
      groupId = created.insertId;
    }

    // Apparatus for this group = its competition categories
    const existing = currentById.get(groupId)?.categories || [];
    const wanted = new Set(g.apparatus);

    const dropped = existing.filter((c) => !wanted.has(c.category));
    await assertCategoriesUnscored(
      conn, dropped.map((c) => c.id),
      `${dropped.map((c) => c.category).join(', ')} from "${name}"`
    );
    for (const c of dropped) {
      await conn.execute('DELETE FROM competition_categories WHERE id = ?', [c.id]);
    }

    for (const apparatus of wanted) {
      if (existing.some((c) => c.category === apparatus)) continue;
      await conn.execute(
        'INSERT INTO competition_categories (competition_id, category, age_group_id) VALUES (?, ?, ?)',
        [competitionId, apparatus, groupId]
      );
    }
  }

  return rebuildEntries(conn, competitionId);
};

// ---------------------------------------------------------------------------
// Entries and score sheets
// ---------------------------------------------------------------------------

/**
 * Re-derive every registered player's age group from their DOB, make the
 * competition entries match (one per apparatus of that age group), then sync the
 * score sheets. Must run inside a transaction.
 *
 * Returns { unassigned } — players whose age fits no age group.
 */
const rebuildEntries = async (conn, competitionId) => {
  const competition = await loadCompetition(conn, competitionId);
  if (!competition) throw new SetupError('Competition not found');
  const refDate = referenceDateOf(competition);
  const groups = await loadAgeGroups(conn, competitionId);

  const [players] = await conn.execute(
    `SELECT p.id, p.first_name, p.last_name, p.date_of_birth, p.gender, p.age_group_id,
            cr.id AS registration_id
     FROM competition_registrations cr
     JOIN players p ON p.team_id = cr.team_id AND p.is_active = TRUE
     WHERE cr.competition_id = ? AND cr.status IN ('pending', 'approved')`,
    [competitionId]
  );

  const desired = new Map(); // `${playerId}:${categoryId}` -> { player, categoryId }
  const unassigned = [];

  for (const p of players) {
    // With a date of birth the age group is derived; without one the admin's
    // chosen group stands (as long as it still exists and suits the gender)
    const age = p.date_of_birth ? ageOn(p.date_of_birth, refDate) : null;
    const group = p.date_of_birth
      ? findAgeGroup(groups, age, p.gender)
      : groups.find((g) => g.id === p.age_group_id &&
          (g.gender === 'mixed' || g.gender === p.gender)) || null;

    if ((group?.id || null) !== p.age_group_id) {
      await conn.execute('UPDATE players SET age_group_id = ? WHERE id = ?', [group?.id || null, p.id]);
    }

    if (!group) {
      unassigned.push({ id: p.id, name: fullName(p), age, gender: p.gender });
      continue;
    }
    for (const c of group.categories) {
      desired.set(`${p.id}:${c.id}`, { player: p, categoryId: c.id });
    }
  }

  const [existing] = await conn.execute(
    'SELECT id, player_id, competition_category_id FROM competition_entries WHERE competition_id = ?',
    [competitionId]
  );
  const existingKeys = new Set(existing.map((e) => `${e.player_id}:${e.competition_category_id}`));

  // Entries that no longer apply (player moved age group, apparatus dropped, …)
  const stale = existing.filter((e) => !desired.has(`${e.player_id}:${e.competition_category_id}`));
  if (stale.length > 0) {
    const staleIds = stale.map((e) => e.id);
    const [scored] = await conn.query(
      `SELECT DISTINCT TRIM(CONCAT(p.first_name, ' ', p.last_name)) AS name
       FROM score_sheet_entries sse
       JOIN players p ON sse.player_id = p.id
       WHERE sse.competition_entry_id IN (?) AND ${SCORED_ROW_SQL}`,
      [staleIds]
    );
    if (scored.length > 0) {
      throw new SetupError(
        `This change would move ${scored.map((s) => s.name).join(', ')} out of a score sheet that already has scores. Clear those scores first.`
      );
    }
    await conn.query('DELETE FROM score_sheet_entries WHERE competition_entry_id IN (?)', [staleIds]);
    await conn.query('DELETE FROM competition_entries WHERE id IN (?)', [staleIds]);
  }

  for (const [key, { player, categoryId }] of desired) {
    if (existingKeys.has(key)) continue;
    await conn.execute(
      `INSERT INTO competition_entries
         (competition_id, registration_id, player_id, competition_category_id, entry_number, status)
       VALUES (?, ?, ?, ?, ?, 'confirmed')`,
      [competitionId, player.registration_id, player.id, categoryId,
        `E-${uuidv4().slice(0, 8).toUpperCase()}`]
    );
  }

  await syncScoreSheets(conn, competitionId, competition.team_best_count);
  return { unassigned };
};

/**
 * One score sheet per age group x apparatus x team, one row per player.
 * Adds missing sheets/rows, removes unscored rows that no longer have an entry,
 * drops sheets left empty, and refreshes team points.
 */
const syncScoreSheets = async (conn, competitionId, bestCount) => {
  if (bestCount === undefined) {
    bestCount = (await loadCompetition(conn, competitionId))?.team_best_count ?? null;
  }
  const [entries] = await conn.execute(
    `SELECT ce.id, ce.player_id, ce.competition_category_id, p.team_id
     FROM competition_entries ce
     JOIN players p ON ce.player_id = p.id
     WHERE ce.competition_id = ? AND ce.status IN ('registered', 'confirmed')
     ORDER BY p.id`,
    [competitionId]
  );

  const [sheets] = await conn.execute(
    `SELECT id, competition_category_id, team_id FROM score_sheets
     WHERE competition_id = ? AND set_type = 'compulsory'`,
    [competitionId]
  );
  const sheetKey = (catId, teamId) => `${catId}:${teamId}`;
  const sheetByKey = new Map(sheets.map((s) => [sheetKey(s.competition_category_id, s.team_id), s.id]));

  // Group entries by sheet
  const bySheet = new Map();
  for (const e of entries) {
    const key = sheetKey(e.competition_category_id, e.team_id);
    if (!bySheet.has(key)) bySheet.set(key, []);
    bySheet.get(key).push(e);
  }

  for (const [key, sheetEntries] of bySheet) {
    let sheetId = sheetByKey.get(key);
    if (!sheetId) {
      const { competition_category_id, team_id } = sheetEntries[0];
      const [created] = await conn.execute(
        `INSERT INTO score_sheets (competition_id, competition_category_id, team_id, set_type)
         VALUES (?, ?, ?, 'compulsory')`,
        [competitionId, competition_category_id, team_id]
      );
      sheetId = created.insertId;
      sheetByKey.set(key, sheetId);
    }

    const [rows] = await conn.execute(
      'SELECT id, player_id, row_no, competition_entry_id FROM score_sheet_entries WHERE score_sheet_id = ?',
      [sheetId]
    );
    const rowByPlayer = new Map(rows.map((r) => [r.player_id, r]));
    let nextRow = rows.reduce((max, r) => Math.max(max, r.row_no), 0) + 1;

    for (const e of sheetEntries) {
      const row = rowByPlayer.get(e.player_id);
      if (!row) {
        await conn.execute(
          `INSERT INTO score_sheet_entries (score_sheet_id, player_id, competition_entry_id, row_no)
           VALUES (?, ?, ?, ?)`,
          [sheetId, e.player_id, e.id, nextRow++]
        );
      } else if (row.competition_entry_id !== e.id) {
        await conn.execute(
          'UPDATE score_sheet_entries SET competition_entry_id = ? WHERE id = ?',
          [e.id, row.id]
        );
      }
    }
  }

  // Rows whose entry is gone, and only if nothing was scored on them
  await conn.execute(
    `DELETE sse FROM score_sheet_entries sse
     JOIN score_sheets ss ON sse.score_sheet_id = ss.id
     LEFT JOIN competition_entries ce ON sse.competition_entry_id = ce.id
     WHERE ss.competition_id = ? AND ce.id IS NULL AND NOT ${SCORED_ROW_SQL}`,
    [competitionId]
  );

  await conn.execute(
    `DELETE ss FROM score_sheets ss
     WHERE ss.competition_id = ?
       AND NOT EXISTS (SELECT 1 FROM score_sheet_entries sse WHERE sse.score_sheet_id = ss.id)`,
    [competitionId]
  );

  // Team points may have changed if rows were removed or the best-N setting changed
  const [finals] = await conn.execute(
    `SELECT ss.id AS sheet_id, sse.final_score
     FROM score_sheets ss
     LEFT JOIN score_sheet_entries sse ON sse.score_sheet_id = ss.id
     WHERE ss.competition_id = ?`,
    [competitionId]
  );
  const finalsBySheet = new Map();
  for (const f of finals) {
    if (!finalsBySheet.has(f.sheet_id)) finalsBySheet.set(f.sheet_id, []);
    if (f.final_score !== null) finalsBySheet.get(f.sheet_id).push(f);
  }
  for (const [sheetId, rows] of finalsBySheet) {
    await conn.execute('UPDATE score_sheets SET team_points = ? WHERE id = ?',
      [calculateTeamPoints(rows, bestCount), sheetId]);
  }
};

// ---------------------------------------------------------------------------
// Teams
// ---------------------------------------------------------------------------

/**
 * Validate a team payload { team_name, players: [{ id?, name, gender, date_of_birth }] }
 * against the competition's age groups. Returns the cleaned players, each with the
 * age group they will land in.
 */
const checkTeamPayload = async (conn, competition, payload, { excludeRegistrationId = null, allowManualGroup = false } = {}) => {
  const teamName = String(payload.team_name || '').trim().replace(/\s+/g, ' ');
  if (!teamName) throw new SetupError('Team name is required');
  if (teamName.length > 100) throw new SetupError('Team name is too long (100 characters max)');

  const [clash] = await conn.execute(
    `SELECT cr.id FROM competition_registrations cr
     JOIN teams t ON cr.team_id = t.id
     WHERE cr.competition_id = ? AND LOWER(TRIM(t.team_name)) = LOWER(?)
       AND cr.status IN ('pending', 'approved') AND cr.id <> ?`,
    [competition.id, teamName, excludeRegistrationId || 0]
  );
  if (clash.length > 0) {
    throw new SetupError(`A team called "${teamName}" is already registered for this competition`);
  }

  const players = Array.isArray(payload.players) ? payload.players : [];
  if (players.length === 0) throw new SetupError('Add at least one player');
  if (competition.max_players_per_team && players.length > competition.max_players_per_team) {
    throw new SetupError(`A team can have at most ${competition.max_players_per_team} players`);
  }

  const groups = await loadAgeGroups(conn, competition.id);
  if (groups.length === 0) {
    throw new SetupError('This competition has no age groups yet. Please contact the organiser.');
  }
  const refDate = referenceDateOf(competition);
  const today = toYMD(new Date());

  const seen = new Set();
  const cleaned = players.map((p, i) => {
    const name = String(p.name || '').trim().replace(/\s+/g, ' ');
    if (!name) throw new SetupError(`Player ${i + 1}: name is required`);
    if (name.length > 100) throw new SetupError(`Player ${i + 1}: name is too long`);
    const parts = splitName(name);
    if (parts.first_name.length > 50 || parts.last_name.length > 50) {
      throw new SetupError(`Player ${i + 1}: name is too long`);
    }

    const nameMarathi = String(p.name_marathi || '').trim().replace(/\s+/g, ' ') || null;
    if (nameMarathi && nameMarathi.length > 150) throw new SetupError(`${name}: Marathi name is too long`);

    const gender = String(p.gender || '').toLowerCase();
    if (!PLAYER_GENDERS.includes(gender)) throw new SetupError(`${name}: choose Boy or Girl`);

    const dob = toYMD(p.date_of_birth);
    const hasDobInput = !(p.date_of_birth === null || p.date_of_birth === undefined || p.date_of_birth === '');
    if (hasDobInput && !dob) throw new SetupError(`${name}: enter a valid date of birth`);
    if (dob && dob > today) throw new SetupError(`${name}: date of birth is in the future`);

    const dupKey = `${name.toLowerCase()}|${dob || ''}`;
    if (seen.has(dupKey)) throw new SetupError(`${name} is listed twice`);
    seen.add(dupKey);

    // No date of birth: the admin picks the age group directly
    if (!dob) {
      if (!allowManualGroup) throw new SetupError(`${name}: a valid date of birth is required`);
      const chosen = groups.find((g) => g.id === Number(p.age_group_id));
      if (!chosen) throw new SetupError(`${name}: enter the date of birth or choose an age group`);
      if (chosen.gender !== 'mixed' && chosen.gender !== gender) {
        throw new SetupError(`${name}: ${chosen.group_name} is not for ${gender === 'male' ? 'boys' : 'girls'}`);
      }
      return {
        id: p.id ? Number(p.id) : null, name, ...parts, name_marathi: nameMarathi,
        gender, date_of_birth: null, age: null, age_group: chosen
      };
    }

    const age = ageOn(dob, refDate);
    const group = findAgeGroup(groups, age, gender);
    if (!group) {
      const open = groups.filter((g) => g.gender === 'mixed' || g.gender === gender);
      const ranges = open.map((g) => `${g.group_name} (${rangeLabel(g)})`).join(', ');
      const who = gender === 'male' ? 'boys' : 'girls';
      throw new SetupError(open.length
        ? `${name} is ${age} years old on ${refDate}, which fits no age group for ${who}. Age groups for ${who}: ${ranges}`
        : `This competition has no age group for ${who}`);
    }

    return {
      id: p.id ? Number(p.id) : null, name, ...parts, name_marathi: nameMarathi,
      gender, date_of_birth: dob, age, age_group: group
    };
  });

  return { teamName, players: cleaned };
};

const insertPlayer = (conn, teamId, p) =>
  conn.execute(
    `INSERT INTO players
       (team_id, first_name, last_name, name_marathi, gender, date_of_birth, age_group_id, registration_number)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [teamId, p.first_name, p.last_name, p.name_marathi, p.gender, p.date_of_birth, p.age_group.id,
      `PL-${uuidv4().slice(0, 8).toUpperCase()}`]
  );

/** Register a new team with its players. Must run inside a transaction. */
const registerTeam = async (conn, competitionId, payload, userId = null, { allowManualGroup = false } = {}) => {
  const competition = await loadCompetition(conn, competitionId);
  if (!competition) throw new SetupError('Competition not found');

  if (competition.max_teams) {
    const [count] = await conn.execute(
      `SELECT COUNT(*) AS n FROM competition_registrations
       WHERE competition_id = ? AND status IN ('pending', 'approved')`,
      [competitionId]
    );
    if (count[0].n >= competition.max_teams) {
      throw new SetupError('This competition has reached its maximum number of teams');
    }
  }

  const { teamName, players } = await checkTeamPayload(conn, competition, payload, { allowManualGroup });

  const teamCode = `TM-${uuidv4().slice(0, 8).toUpperCase()}`;
  const [team] = await conn.execute(
    'INSERT INTO teams (team_name, team_code, manager_id) VALUES (?, ?, NULL)',
    [teamName, teamCode]
  );

  const [registration] = await conn.execute(
    `INSERT INTO competition_registrations
       (competition_id, team_id, status, approved_by, approved_at)
     VALUES (?, ?, 'approved', ?, NOW())`,
    [competitionId, team.insertId, userId]
  );

  for (const p of players) await insertPlayer(conn, team.insertId, p);

  await rebuildEntries(conn, competitionId);

  return {
    registrationId: registration.insertId,
    teamId: team.insertId,
    team_name: teamName,
    team_code: teamCode,
    players: players.map((p) => ({
      name: p.name, name_marathi: p.name_marathi, gender: p.gender, date_of_birth: p.date_of_birth, age: p.age,
      age_group: p.age_group.group_name, apparatus: p.age_group.apparatus
    }))
  };
};

const loadRegistration = async (conn, registrationId) => {
  const [rows] = await conn.execute(
    `SELECT cr.id, cr.competition_id, cr.team_id, t.team_name
     FROM competition_registrations cr JOIN teams t ON cr.team_id = t.id
     WHERE cr.id = ?`,
    [registrationId]
  );
  if (rows.length === 0) throw new SetupError('Team registration not found');
  return rows[0];
};

/** Refuse to remove players whose rows hold scores. */
const assertPlayersUnscored = async (conn, playerIds, competitionId, what) => {
  if (playerIds.length === 0) return;
  const [rows] = await conn.query(
    `SELECT DISTINCT TRIM(CONCAT(p.first_name, ' ', p.last_name)) AS name
     FROM score_sheet_entries sse
     JOIN score_sheets ss ON sse.score_sheet_id = ss.id
     JOIN players p ON sse.player_id = p.id
     WHERE ss.competition_id = ? AND sse.player_id IN (?) AND ${SCORED_ROW_SQL}`,
    [competitionId, playerIds]
  );
  if (rows.length > 0) {
    throw new SetupError(`Cannot ${what}: ${rows.map((r) => r.name).join(', ')} already ha${rows.length === 1 ? 's' : 've'} scores. Clear those scores first.`);
  }
};

/** Admin edit of a registered team: rename, and add / change / remove players. */
const updateTeam = async (conn, registrationId, payload, { allowManualGroup = true } = {}) => {
  const reg = await loadRegistration(conn, registrationId);
  const competition = await loadCompetition(conn, reg.competition_id);
  const { teamName, players } = await checkTeamPayload(conn, competition, payload, {
    excludeRegistrationId: reg.id, allowManualGroup
  });

  const [current] = await conn.execute('SELECT id FROM players WHERE team_id = ?', [reg.team_id]);
  const currentIds = new Set(current.map((p) => p.id));

  for (const p of players) {
    if (p.id && !currentIds.has(p.id)) throw new SetupError('One of the players does not belong to this team');
  }

  const keep = new Set(players.filter((p) => p.id).map((p) => p.id));
  const removedIds = [...currentIds].filter((id) => !keep.has(id));
  await assertPlayersUnscored(conn, removedIds, reg.competition_id, 'remove a player');

  await conn.execute('UPDATE teams SET team_name = ? WHERE id = ?', [teamName, reg.team_id]);
  if (removedIds.length) await conn.query('DELETE FROM players WHERE id IN (?)', [removedIds]);

  for (const p of players) {
    if (p.id) {
      await conn.execute(
        `UPDATE players SET first_name = ?, last_name = ?, name_marathi = ?, gender = ?, date_of_birth = ?,
           age_group_id = ? WHERE id = ?`,
        [p.first_name, p.last_name, p.name_marathi, p.gender, p.date_of_birth, p.age_group.id, p.id]
      );
    } else {
      await insertPlayer(conn, reg.team_id, p);
    }
  }

  return rebuildEntries(conn, reg.competition_id);
};

/** Remove a team (and its players) from the competition. */
const deleteTeam = async (conn, registrationId) => {
  const reg = await loadRegistration(conn, registrationId);
  const [players] = await conn.execute('SELECT id FROM players WHERE team_id = ?', [reg.team_id]);
  await assertPlayersUnscored(conn, players.map((p) => p.id), reg.competition_id, 'delete this team');

  // The team was created by this registration, so it goes with it (players cascade)
  await conn.execute('DELETE FROM teams WHERE id = ?', [reg.team_id]);
  await syncScoreSheets(conn, reg.competition_id);
  return reg;
};

/** Run fn(conn) in a transaction; SetupErrors become { status, message }. */
const withTransaction = async (pool, fn) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
};

/** Express helper: answer a SetupError with 400, anything else with 500. */
const sendError = (res, error, fallback) => {
  if (error instanceof SetupError) {
    return res.status(400).json({ success: false, message: error.message });
  }
  console.error(fallback, error);
  return res.status(500).json({ success: false, message: fallback });
};

module.exports = {
  APPARATUS,
  APPARATUS_VALUES,
  PLAYER_GENDERS,
  GROUP_GENDERS,
  GENDER_LABEL,
  SetupError,
  SCORED_ROW_SQL,
  toYMD,
  ageOn,
  referenceDateOf,
  rangeLabel,
  findAgeGroup,
  fullName,
  splitName,
  insertPlayer,
  loadCompetition,
  loadAgeGroups,
  validateAgeGroups,
  saveAgeGroups,
  rebuildEntries,
  syncScoreSheets,
  registerTeam,
  updateTeam,
  deleteTeam,
  withTransaction,
  sendError
};
