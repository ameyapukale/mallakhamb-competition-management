// Public, no-login endpoints behind the landing page: list competitions, register
// a team, and follow the live results.

const express = require('express');
const router = express.Router();
const { body, param } = require('express-validator');
const { toMarathi } = require('../utils/transliterate');
const { pool } = require('../config/database');
const { validate } = require('../middleware/validation.middleware');
const { logActivity } = require('../utils/activityLogger');
const {
  APPARATUS, loadAgeGroups, referenceDateOf, toYMD,
  registerTeam, withTransaction, sendError
} = require('../utils/competitionSetup');
const { buildResults } = require('../utils/results');

// Statuses the public may see. Drafts and cancelled competitions stay hidden.
const PUBLIC_STATUSES = ['registration_open', 'registration_closed', 'ongoing', 'completed'];

const publicCompetition = async (c) => {
  const groups = await loadAgeGroups(pool, c.id);
  return {
    id: c.id,
    competition_name: c.competition_name,
    description: c.description,
    venue: c.venue,
    city: c.city,
    state: c.state,
    start_date: toYMD(c.start_date),
    end_date: toYMD(c.end_date),
    age_reference_date: referenceDateOf(c),
    status: c.status,
    registration_open: c.status === 'registration_open',
    max_players_per_team: c.max_players_per_team,
    team_best_count: c.team_best_count,
    organizer_name: c.organizer_name,
    organizer_contact: c.organizer_contact,
    registered_teams: Number(c.registered_teams || 0),
    age_groups: groups.map((g) => ({
      id: g.id, group_name: g.group_name, min_age: g.min_age, max_age: g.max_age, gender: g.gender, apparatus: g.apparatus
    }))
  };
};

const competitionQuery = `
  SELECT c.*,
         (SELECT COUNT(*) FROM competition_registrations cr
           WHERE cr.competition_id = c.id AND cr.status IN ('pending', 'approved')) AS registered_teams
  FROM competitions c
  WHERE c.is_active = TRUE AND c.status IN (${PUBLIC_STATUSES.map(() => '?').join(', ')})`;

router.get('/competitions', async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `${competitionQuery}
       ORDER BY FIELD(c.status, 'registration_open', 'ongoing', 'registration_closed', 'completed'),
                c.start_date DESC`,
      PUBLIC_STATUSES
    );
    const data = await Promise.all(rows.map(publicCompetition));
    res.json({ success: true, data, apparatus: APPARATUS });
  } catch (error) {
    sendError(res, error, 'Failed to load competitions');
  }
});

router.get('/competitions/:id', [
  param('id').isInt().withMessage('Valid competition ID is required'),
  validate
], async (req, res) => {
  try {
    const [rows] = await pool.execute(`${competitionQuery} AND c.id = ?`, [...PUBLIC_STATUSES, req.params.id]);
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Competition not found' });
    }
    res.json({ success: true, data: await publicCompetition(rows[0]), apparatus: APPARATUS });
  } catch (error) {
    sendError(res, error, 'Failed to load competition');
  }
});

// Register a team: { team_name, players: [{ name, name_marathi, gender, date_of_birth }] }
router.post('/competitions/:id/register', [
  param('id').isInt().withMessage('Valid competition ID is required'),
  validate
], async (req, res) => {
  try {
    const [rows] = await pool.execute(
      'SELECT status FROM competitions WHERE id = ? AND is_active = TRUE',
      [req.params.id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Competition not found' });
    }
    if (rows[0].status !== 'registration_open') {
      return res.status(400).json({ success: false, message: 'Registration for this competition is closed' });
    }

    const result = await withTransaction(pool, (conn) =>
      registerTeam(conn, Number(req.params.id), req.body)
    );

    await logActivity(null, 'TEAM_REGISTERED_PUBLIC', 'competition_registrations',
      result.registrationId, null, { team_name: result.team_name, players: result.players.length }, req);

    res.status(201).json({ success: true, message: 'Team registered successfully', data: result });
  } catch (error) {
    sendError(res, error, 'Failed to register team');
  }
});

// Name in English -> suggested Marathi spelling, for the registration form.
// { text } -> { text, suggestions, source }
router.post('/transliterate', [
  body('text').isString().isLength({ max: 150 }).withMessage('Text is too long'),
  validate
], async (req, res) => {
  try {
    res.json({ success: true, data: await toMarathi(req.body.text) });
  } catch (error) {
    sendError(res, error, 'Failed to convert the name');
  }
});

// Live results — individual, team and overall rankings per age group
router.get('/competitions/:id/results', [
  param('id').isInt().withMessage('Valid competition ID is required'),
  validate
], async (req, res) => {
  try {
    const [rows] = await pool.execute(`${competitionQuery} AND c.id = ?`, [...PUBLIC_STATUSES, req.params.id]);
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Competition not found' });
    }
    const results = await buildResults(pool, req.params.id);
    res.json({
      success: true,
      data: {
        competition: { id: rows[0].id, competition_name: rows[0].competition_name, status: rows[0].status },
        ...results
      }
    });
  } catch (error) {
    sendError(res, error, 'Failed to load results');
  }
});

module.exports = router;
