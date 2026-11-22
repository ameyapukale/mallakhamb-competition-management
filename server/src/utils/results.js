// Live results, computed straight from the score sheets on every request so they
// are always in step with what the scorer has just saved.
//
// Per age group:
//   individual score = sum of the player's अंतिम गुण over the apparatus of that age group
//   team score       = per apparatus, the sum of the team's players' अंतिम गुण —
//                      only the best N when the competition counts the best N —
//                      added up over the apparatus (= the sum of the sheets' संघिक गुण)
// Plus an overall team table across every age group.
//
// Ranking is "1, 2, 2, 4": equal totals share a rank. Anyone with nothing scored
// yet is listed unranked at the bottom.

const { APPARATUS, GENDER_LABEL, loadAgeGroups, loadCompetition } = require('./competitionSetup');
const { bestCountOf, countedFinals } = require('./scoreSheet');

const APPARATUS_LABEL = Object.fromEntries(APPARATUS.map((a) => [a.value, a.label]));

const round = (v, places = 3) => (v === null ? null : Math.round(v * 10 ** places) / 10 ** places);

/** Sort by total desc and assign shared ranks; unscored rows go last, unranked. */
const rank = (rows) => {
  const scored = rows.filter((r) => r.total !== null).sort((a, b) => b.total - a.total);
  const unscored = rows.filter((r) => r.total === null)
    .sort((a, b) => a.name.localeCompare(b.name));

  let previous = null;
  scored.forEach((row, index) => {
    // Compare at the stored precision so float noise never splits a tie
    row.rank = previous !== null && round(row.total) === round(previous.total) ? previous.rank : index + 1;
    previous = row;
  });
  unscored.forEach((row) => { row.rank = null; });
  return [...scored, ...unscored];
};

const buildResults = async (executor, competitionId) => {
  const groups = await loadAgeGroups(executor, competitionId);
  const competition = await loadCompetition(executor, competitionId);
  const bestCount = bestCountOf(competition?.team_best_count);

  // Every registered player with their age group
  const [players] = await executor.execute(
    `SELECT p.id, TRIM(CONCAT(p.first_name, ' ', p.last_name)) AS name, p.name_marathi, p.gender, p.age_group_id,
            t.id AS team_id, t.team_name
     FROM competition_registrations cr
     JOIN teams t ON cr.team_id = t.id
     JOIN players p ON p.team_id = t.id AND p.is_active = TRUE
     WHERE cr.competition_id = ? AND cr.status IN ('pending', 'approved')`,
    [competitionId]
  );

  // Every scored or unscored row on every sheet
  const [rows] = await executor.execute(
    `SELECT sse.player_id, sse.final_score, sse.average_score, sse.deduction,
            cc.category, cc.age_group_id, ss.team_id, ss.status
     FROM score_sheet_entries sse
     JOIN score_sheets ss ON sse.score_sheet_id = ss.id
     JOIN competition_categories cc ON ss.competition_category_id = cc.id
     WHERE ss.competition_id = ? AND ss.set_type = 'compulsory'`,
    [competitionId]
  );

  const scoreOf = new Map(); // `${playerId}:${apparatus}` -> final_score
  for (const r of rows) {
    if (r.final_score !== null) scoreOf.set(`${r.player_id}:${r.category}`, Number(r.final_score));
  }

  const [sheetStats] = await executor.execute(
    `SELECT cc.age_group_id,
            COUNT(*) AS rows_total,
            SUM(sse.final_score IS NOT NULL) AS rows_scored
     FROM score_sheet_entries sse
     JOIN score_sheets ss ON sse.score_sheet_id = ss.id
     JOIN competition_categories cc ON ss.competition_category_id = cc.id
     WHERE ss.competition_id = ?
     GROUP BY cc.age_group_id`,
    [competitionId]
  );
  const progressOf = new Map(sheetStats.map((s) => [s.age_group_id, s]));

  const overallTeams = new Map();

  const ageGroups = groups.map((g) => {
    const apparatus = g.apparatus;
    const members = players.filter((p) => p.age_group_id === g.id);

    // Individuals
    const individuals = rank(members.map((p) => {
      const scores = {};
      let total = null;
      for (const a of apparatus) {
        const s = scoreOf.has(`${p.id}:${a}`) ? scoreOf.get(`${p.id}:${a}`) : null;
        scores[a] = s;
        if (s !== null) total = (total || 0) + s;
      }
      return {
        player_id: p.id, name: p.name, name_marathi: p.name_marathi, gender: p.gender, team_id: p.team_id, team_name: p.team_name,
        scores, total: round(total)
      };
    }));

    // Teams: per apparatus, add up the finals that count (all, or the best N)
    const teamMap = new Map();
    for (const ind of individuals) {
      if (!teamMap.has(ind.team_id)) {
        teamMap.set(ind.team_id, {
          team_id: ind.team_id, name: ind.team_name, team_name: ind.team_name, members: []
        });
      }
      teamMap.get(ind.team_id).members.push(ind);
    }
    const teams = rank([...teamMap.values()].map(({ members, ...team }) => {
      const scores = {};
      let total = null;
      for (const a of apparatus) {
        const counted = countedFinals(members.map((m) => m.scores[a]), bestCount);
        scores[a] = counted.length ? round(counted.reduce((sum, v) => sum + v, 0)) : null;
        if (scores[a] !== null) total = round((total || 0) + scores[a]);
      }
      return { ...team, players: members.length, scores, total };
    }));

    for (const t of teams) {
      if (!overallTeams.has(t.team_id)) {
        overallTeams.set(t.team_id, {
          team_id: t.team_id, name: t.team_name, team_name: t.team_name, by_age_group: {}, total: null
        });
      }
      const o = overallTeams.get(t.team_id);
      o.by_age_group[g.id] = t.total;
      if (t.total !== null) o.total = round((o.total || 0) + t.total);
    }

    const progress = progressOf.get(g.id);
    return {
      age_group_id: g.id,
      group_name: g.group_name,
      gender: g.gender,
      gender_label: GENDER_LABEL[g.gender],
      min_age: g.min_age,
      max_age: g.max_age,
      apparatus: apparatus.map((a) => ({ value: a, label: APPARATUS_LABEL[a] })),
      progress: {
        rows_total: Number(progress?.rows_total || 0),
        rows_scored: Number(progress?.rows_scored || 0)
      },
      individuals,
      teams
    };
  });

  return {
    team_best_count: bestCount,
    age_groups: ageGroups,
    overall_teams: rank([...overallTeams.values()]),
    generated_at: new Date().toISOString()
  };
};

module.exports = { buildResults };
