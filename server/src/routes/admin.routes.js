// Admin console for the simplified flow: competitions with their age groups,
// registered teams, the scoring board and results. Every route is admin-only.

const express = require('express');
const router = express.Router();
const { body, param } = require('express-validator');
const { v4: uuidv4 } = require('uuid');
const { pool } = require('../config/database');
const { validate } = require('../middleware/validation.middleware');
const { authenticateToken, isAdmin } = require('../middleware/auth.middleware');
const { logActivity } = require('../utils/activityLogger');
const {
  APPARATUS, SCORED_ROW_SQL, toYMD, ageOn, referenceDateOf,
  loadCompetition, loadAgeGroups, saveAgeGroups, rebuildEntries,
  registerTeam, updateTeam, deleteTeam, withTransaction, sendError, SetupError
} = require('../utils/competitionSetup');
const { buildResults } = require('../utils/results');

const STATUSES = ['draft', 'registration_open', 'registration_closed', 'ongoing', 'completed'];

router.use(authenticateToken, isAdmin);

const idParam = (name = 'id') => [param(name).isInt().withMessage('Valid ID is required'), validate];

const competitionFields = [
  body('competition_name').trim().notEmpty().withMessage('Competition name is required')
    .isLength({ max: 150 }).withMessage('Competition name is too long'),
  body('start_date').isDate().withMessage('Valid start date is required'),
  body('end_date').isDate().withMessage('Valid end date is required'),
  body('age_reference_date').optional({ values: 'falsy' }).isDate().withMessage('Valid age reference date is required'),
  body('max_teams').optional({ values: 'falsy' }).isInt({ min: 1 }).withMessage('Max teams must be a positive number'),
  body('max_players_per_team').optional({ values: 'falsy' }).isInt({ min: 1 }).withMessage('Max players must be a positive number'),
  body('team_best_count').optional({ values: 'falsy' }).isInt({ min: 1, max: 100 }).withMessage('"Best players counted" must be a positive number'),
  body('age_groups').isArray({ min: 1 }).withMessage('Add at least one age group'),
  validate
];

const competitionValues = (b) => [
  b.competition_name.trim(),
  b.description?.trim() || null,
  b.venue?.trim() || null,
  b.city?.trim() || null,
  b.state?.trim() || null,
  b.start_date,
  b.end_date,
  b.age_reference_date || null,
  b.max_teams ? Number(b.max_teams) : null,
  b.max_players_per_team ? Number(b.max_players_per_team) : null,
  b.team_best_count ? Number(b.team_best_count) : null,
  b.organizer_name?.trim() || null,
  b.organizer_contact?.trim() || null
];

const checkDates = (b) => {
  if (b.end_date < b.start_date) throw new SetupError('End date cannot be before the start date');
};

const competitionSummary = async (c) => ({
  ...c,
  start_date: toYMD(c.start_date),
  end_date: toYMD(c.end_date),
  age_reference_date: toYMD(c.age_reference_date),
  effective_age_reference_date: referenceDateOf(c),
  age_groups: (await loadAgeGroups(pool, c.id)).map((g) => ({
    id: g.id, group_name: g.group_name, min_age: g.min_age, max_age: g.max_age, gender: g.gender, apparatus: g.apparatus
  }))
});

// ---------------------------------------------------------------------------
// Competitions
// ---------------------------------------------------------------------------

router.get('/competitions', async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT c.*,
              (SELECT COUNT(*) FROM competition_registrations cr
                WHERE cr.competition_id = c.id AND cr.status IN ('pending', 'approved')) AS team_count,
              (SELECT COUNT(*) FROM competition_registrations cr
                JOIN players p ON p.team_id = cr.team_id
                WHERE cr.competition_id = c.id AND cr.status IN ('pending', 'approved')) AS player_count
       FROM competitions c
       WHERE c.is_active = TRUE
       ORDER BY c.start_date DESC, c.id DESC`
    );
    res.json({ success: true, data: await Promise.all(rows.map(competitionSummary)) });
  } catch (error) {
    sendError(res, error, 'Failed to load competitions');
  }
});

router.get('/competitions/:id', idParam(), async (req, res) => {
  try {
    const c = await loadCompetition(pool, req.params.id);
    if (!c) return res.status(404).json({ success: false, message: 'Competition not found' });

    const [[counts]] = await pool.execute(
      `SELECT
         (SELECT COUNT(*) FROM competition_registrations cr
           WHERE cr.competition_id = ? AND cr.status IN ('pending', 'approved')) AS team_count,
         (SELECT COUNT(*) FROM score_sheets WHERE competition_id = ?) AS sheet_count,
         (SELECT COUNT(*) FROM score_sheet_entries sse JOIN score_sheets ss ON sse.score_sheet_id = ss.id
           WHERE ss.competition_id = ?) AS row_count,
         (SELECT COUNT(*) FROM score_sheet_entries sse JOIN score_sheets ss ON sse.score_sheet_id = ss.id
           WHERE ss.competition_id = ? AND sse.final_score IS NOT NULL) AS scored_count,
         (SELECT COUNT(*) FROM score_sheet_entries sse JOIN score_sheets ss ON sse.score_sheet_id = ss.id
           WHERE ss.competition_id = ? AND ${SCORED_ROW_SQL}) AS touched_count`,
      Array(5).fill(req.params.id)
    );

    res.json({
      success: true,
      data: {
        ...(await competitionSummary(c)),
        statuses: STATUSES,
        apparatus_options: APPARATUS,
        counts: Object.fromEntries(Object.entries(counts).map(([k, v]) => [k, Number(v)])),
        // Once anything is scored, age groups and apparatus with scores cannot be removed
        scoring_started: Number(counts.touched_count) > 0
      }
    });
  } catch (error) {
    sendError(res, error, 'Failed to load competition');
  }
});

router.post('/competitions', competitionFields, async (req, res) => {
  try {
    checkDates(req.body);
    const result = await withTransaction(pool, async (conn) => {
      const [created] = await conn.execute(
        `INSERT INTO competitions
           (competition_name, description, venue, city, state, start_date, end_date,
            age_reference_date, max_teams, max_players_per_team, team_best_count, organizer_name,
            organizer_contact, competition_code, status, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?)`,
        [...competitionValues(req.body), `COMP-${uuidv4().slice(0, 8).toUpperCase()}`, req.user.id]
      );
      await saveAgeGroups(conn, created.insertId, req.body.age_groups);
      return { competitionId: created.insertId };
    });

    await logActivity(req.user.id, 'COMPETITION_CREATED', 'competitions', result.competitionId, null, req.body, req);
    res.status(201).json({ success: true, message: 'Competition created', data: result });
  } catch (error) {
    sendError(res, error, 'Failed to create competition');
  }
});

router.put('/competitions/:id', [param('id').isInt(), ...competitionFields], async (req, res) => {
  try {
    checkDates(req.body);
    const competitionId = Number(req.params.id);
    const result = await withTransaction(pool, async (conn) => {
      const existing = await loadCompetition(conn, competitionId);
      if (!existing) throw new SetupError('Competition not found');

      await conn.execute(
        `UPDATE competitions SET
           competition_name = ?, description = ?, venue = ?, city = ?, state = ?,
           start_date = ?, end_date = ?, age_reference_date = ?, max_teams = ?,
           max_players_per_team = ?, team_best_count = ?, organizer_name = ?, organizer_contact = ?
         WHERE id = ?`,
        [...competitionValues(req.body), competitionId]
      );
      // Re-sorts every player into the (possibly changed) age groups
      return saveAgeGroups(conn, competitionId, req.body.age_groups);
    });

    await logActivity(req.user.id, 'COMPETITION_UPDATED', 'competitions', competitionId, null, req.body, req);
    res.json({
      success: true,
      message: result.unassigned.length
        ? `Saved. ${result.unassigned.length} player(s) no longer fit any age group: ${result.unassigned.map((p) => `${p.name} (${p.age})`).join(', ')}`
        : 'Competition saved',
      data: result
    });
  } catch (error) {
    sendError(res, error, 'Failed to save competition');
  }
});

router.patch('/competitions/:id/status', [
  param('id').isInt(),
  body('status').isIn(STATUSES).withMessage('Valid status is required'),
  validate
], async (req, res) => {
  try {
    const [result] = await pool.execute(
      'UPDATE competitions SET status = ? WHERE id = ? AND is_active = TRUE',
      [req.body.status, req.params.id]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: 'Competition not found' });
    }
    await logActivity(req.user.id, 'COMPETITION_STATUS_CHANGED', 'competitions', req.params.id, null, req.body, req);
    res.json({ success: true, message: 'Status updated' });
  } catch (error) {
    sendError(res, error, 'Failed to update status');
  }
});

// Soft delete: hides the competition everywhere but keeps its data
router.delete('/competitions/:id', idParam(), async (req, res) => {
  try {
    const [result] = await pool.execute(
      'UPDATE competitions SET is_active = FALSE WHERE id = ? AND is_active = TRUE',
      [req.params.id]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: 'Competition not found' });
    }
    await logActivity(req.user.id, 'COMPETITION_DELETED', 'competitions', req.params.id, null, null, req);
    res.json({ success: true, message: 'Competition deleted' });
  } catch (error) {
    sendError(res, error, 'Failed to delete competition');
  }
});

// Re-derive age groups, entries and score sheets from scratch (safe to repeat)
router.post('/competitions/:id/rebuild', idParam(), async (req, res) => {
  try {
    const result = await withTransaction(pool, (conn) => rebuildEntries(conn, Number(req.params.id)));
    res.json({ success: true, message: 'Score sheets are up to date', data: result });
  } catch (error) {
    sendError(res, error, 'Failed to rebuild score sheets');
  }
});

// ---------------------------------------------------------------------------
// Teams
// ---------------------------------------------------------------------------

router.get('/competitions/:id/teams', idParam(), async (req, res) => {
  try {
    const c = await loadCompetition(pool, req.params.id);
    if (!c) return res.status(404).json({ success: false, message: 'Competition not found' });
    const refDate = referenceDateOf(c);

    const [teams] = await pool.execute(
      `SELECT cr.id AS registration_id, cr.team_id, cr.registration_date, t.team_name, t.team_code
       FROM competition_registrations cr
       JOIN teams t ON cr.team_id = t.id
       WHERE cr.competition_id = ? AND cr.status IN ('pending', 'approved')
       ORDER BY cr.registration_date, cr.id`,
      [req.params.id]
    );

    const [players] = await pool.execute(
      `SELECT p.id, p.team_id, TRIM(CONCAT(p.first_name, ' ', p.last_name)) AS name, p.name_marathi, p.gender,
              DATE_FORMAT(p.date_of_birth, '%Y-%m-%d') AS date_of_birth,
              p.age_group_id, ag.group_name AS age_group_name,
              EXISTS (SELECT 1 FROM score_sheet_entries sse WHERE sse.player_id = p.id AND ${SCORED_ROW_SQL}) AS has_scores
       FROM competition_registrations cr
       JOIN players p ON p.team_id = cr.team_id AND p.is_active = TRUE
       LEFT JOIN age_groups ag ON p.age_group_id = ag.id
       WHERE cr.competition_id = ? AND cr.status IN ('pending', 'approved')
       ORDER BY p.id`,
      [req.params.id]
    );

    res.json({
      success: true,
      data: teams.map((t) => {
        const squad = players
          .filter((p) => p.team_id === t.team_id)
          .map((p) => ({
            ...p,
            age_group_name: p.age_group_name?.trim() || null,
            age: p.date_of_birth ? ageOn(p.date_of_birth, refDate) : null,
            has_scores: Boolean(p.has_scores)
          }));
        return { ...t, players: squad, player_count: squad.length };
      })
    });
  } catch (error) {
    sendError(res, error, 'Failed to load teams');
  }
});

// Admin can register a team in any status (e.g. a late entry)
router.post('/competitions/:id/teams', idParam(), async (req, res) => {
  try {
    const result = await withTransaction(pool, (conn) =>
      registerTeam(conn, Number(req.params.id), req.body, req.user.id, { allowManualGroup: true })
    );
    await logActivity(req.user.id, 'TEAM_REGISTERED_ADMIN', 'competition_registrations',
      result.registrationId, null, { team_name: result.team_name }, req);
    res.status(201).json({ success: true, message: 'Team registered', data: result });
  } catch (error) {
    sendError(res, error, 'Failed to register team');
  }
});

router.put('/teams/:registrationId', idParam('registrationId'), async (req, res) => {
  try {
    const result = await withTransaction(pool, (conn) => updateTeam(conn, Number(req.params.registrationId), req.body));
    await logActivity(req.user.id, 'TEAM_UPDATED', 'competition_registrations',
      req.params.registrationId, null, req.body, req);
    res.json({ success: true, message: 'Team saved', data: result });
  } catch (error) {
    sendError(res, error, 'Failed to save team');
  }
});

router.delete('/teams/:registrationId', idParam('registrationId'), async (req, res) => {
  try {
    const reg = await withTransaction(pool, (conn) => deleteTeam(conn, Number(req.params.registrationId)));
    await logActivity(req.user.id, 'TEAM_DELETED', 'competition_registrations',
      req.params.registrationId, { team_name: reg.team_name }, null, req);
    res.json({ success: true, message: `${reg.team_name} removed` });
  } catch (error) {
    sendError(res, error, 'Failed to delete team');
  }
});

// ---------------------------------------------------------------------------
// Scoring board and results
// ---------------------------------------------------------------------------

// Every score sheet, grouped age group -> apparatus -> team, with progress
router.get('/competitions/:id/scoring-board', idParam(), async (req, res) => {
  try {
    const groups = await loadAgeGroups(pool, req.params.id);
    const [sheets] = await pool.execute(
      `SELECT ss.id, ss.competition_category_id, ss.status, ss.team_points, t.team_name,
              COUNT(sse.id) AS player_count,
              SUM(sse.final_score IS NOT NULL) AS scored_count
       FROM score_sheets ss
       JOIN teams t ON ss.team_id = t.id
       LEFT JOIN score_sheet_entries sse ON sse.score_sheet_id = ss.id
       WHERE ss.competition_id = ? AND ss.set_type = 'compulsory'
       GROUP BY ss.id
       ORDER BY t.team_name`,
      [req.params.id]
    );

    res.json({
      success: true,
      data: groups.map((g) => ({
        age_group_id: g.id,
        group_name: g.group_name,
        gender: g.gender,
        min_age: g.min_age,
        max_age: g.max_age,
        apparatus: g.categories.map((c) => ({
          competition_category_id: c.id,
          apparatus: c.category,
          label: APPARATUS.find((a) => a.value === c.category)?.label,
          sheets: sheets
            .filter((s) => s.competition_category_id === c.id)
            .map((s) => ({
              id: s.id,
              team_name: s.team_name,
              status: s.status,
              team_points: s.team_points === null ? null : Number(s.team_points),
              player_count: Number(s.player_count),
              scored_count: Number(s.scored_count || 0)
            }))
        }))
      }))
    });
  } catch (error) {
    sendError(res, error, 'Failed to load scoring board');
  }
});

// Same data as the public results, but available in any status (incl. draft)
router.get('/competitions/:id/results', idParam(), async (req, res) => {
  try {
    const c = await loadCompetition(pool, req.params.id);
    if (!c) return res.status(404).json({ success: false, message: 'Competition not found' });
    const results = await buildResults(pool, req.params.id);
    res.json({
      success: true,
      data: { competition: { id: c.id, competition_name: c.competition_name, status: c.status }, ...results }
    });
  } catch (error) {
    sendError(res, error, 'Failed to load results');
  }
});

module.exports = router;
