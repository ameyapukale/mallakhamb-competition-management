const express = require('express');
const router = express.Router();
const { body, param } = require('express-validator');
const { pool } = require('../config/database');
const { validate } = require('../middleware/validation.middleware');
const { authenticateToken, isAdmin } = require('../middleware/auth.middleware');
const { logActivity } = require('../utils/activityLogger');
const { v4: uuidv4 } = require('uuid');
const {
  ACTIVE_COMPETITION_STATUSES,
  PANEL_ELIGIBLE_ROLES,
  activeStatusPlaceholders
} = require('../utils/panelPositions');
const { genderOfAgeGroup } = require('../utils/ageGroups');
const { getPersonAccountIds, ownsRecord } = require('../utils/accountIdentity');

// Get all competitions
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { status, city, state } = req.query;
    let query = `
      SELECT c.*, u.full_name as created_by_name,
             (SELECT COUNT(DISTINCT team_id) FROM competition_registrations WHERE competition_id = c.id) as registered_teams
      FROM competitions c
      LEFT JOIN users u ON c.created_by = u.id
      WHERE c.is_active = TRUE
    `;
    const params = [];

    if (status) {
      query += ' AND c.status = ?';
      params.push(status);
    }
    if (city) {
      query += ' AND c.city = ?';
      params.push(city);
    }
    if (state) {
      query += ' AND c.state = ?';
      params.push(state);
    }

    query += ' ORDER BY c.start_date DESC';

    const [competitions] = await pool.execute(query, params);
    res.json({ success: true, data: competitions });
  } catch (error) {
    console.error('Get competitions error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch competitions' });
  }
});

// Get competition by ID
router.get('/:id', authenticateToken, [
  param('id').isInt().withMessage('Valid competition ID is required'),
  validate
], async (req, res) => {
  try {
    const [competitions] = await pool.execute(
      `SELECT c.*, u.full_name as created_by_name
       FROM competitions c
       LEFT JOIN users u ON c.created_by = u.id
       WHERE c.id = ?`,
      [req.params.id]
    );

    if (competitions.length === 0) {
      return res.status(404).json({ success: false, message: 'Competition not found' });
    }

    // Get categories for this competition
    const [categories] = await pool.execute(
      `SELECT cc.*, ag.group_name as age_group_name
       FROM competition_categories cc
       JOIN age_groups ag ON cc.age_group_id = ag.id
       WHERE cc.competition_id = ?`,
      [req.params.id]
    );

    // Get registered teams count
    const [registrations] = await pool.execute(
      `SELECT cr.*, t.team_name
       FROM competition_registrations cr
       JOIN teams t ON cr.team_id = t.id
       WHERE cr.competition_id = ?`,
      [req.params.id]
    );

    res.json({ 
      success: true, 
      data: { 
        ...competitions[0], 
        categories,
        registrations,
        registered_teams_count: registrations.length
      } 
    });
  } catch (error) {
    console.error('Get competition error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch competition' });
  }
});

// Create competition (admin only)
router.post('/', authenticateToken, isAdmin, [
  body('competition_name').trim().notEmpty().withMessage('Competition name is required'),
  body('start_date').isDate().withMessage('Valid start date is required'),
  body('end_date').isDate().withMessage('Valid end date is required'),
  body('registration_start_date').isDate().withMessage('Valid registration start date is required'),
  body('registration_end_date').isDate().withMessage('Valid registration end date is required'),
  validate
], async (req, res) => {
  const connection = await pool.getConnection();
  try {
    const {
      competition_name, description, venue, address, city, state,
      start_date, end_date, registration_start_date, registration_end_date,
      max_teams, max_players_per_team, entry_fee, prize_pool, rules,
      organizer_name, organizer_contact, logo_url, categories
    } = req.body;

    const competition_code = `COMP-${uuidv4().slice(0, 8).toUpperCase()}`;
    console.log('Generated competition code:', competition_code);
    console.log('Creating competition with competition_name:', competition_name);
    await connection.beginTransaction();

    const [result] = await connection.execute(
      `INSERT INTO competitions (
        competition_name, competition_code, description, venue, address, city, state,
        start_date, end_date, registration_start_date, registration_end_date,
        max_teams, max_players_per_team, entry_fee, prize_pool, rules,
        organizer_name, organizer_contact, logo_url, status, created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?)`,
      [competition_name, competition_code, description || null, venue || null, address || null, city || null, state || null,
       start_date, end_date, registration_start_date, registration_end_date,
       max_teams || null, max_players_per_team || null, entry_fee || 0, prize_pool || 0, rules || null,
       organizer_name || null, organizer_contact || null, logo_url || null, req.user.id]
    );

    const competitionId = result.insertId;

    // Add competition categories if provided
    if (categories && categories.length > 0) {
      for (const cat of categories) {
        await connection.execute(
          `INSERT INTO competition_categories (competition_id, category, age_group_id, max_participants)
           VALUES (?, ?, ?, ?)`,
          [competitionId, cat.category, cat.age_group_id, cat.max_participants || null]
        );
      }
    }

    await connection.commit();

    await logActivity(req.user.id, 'COMPETITION_CREATED', 'competitions', competitionId, null, req.body, req);

    res.status(201).json({
      success: true,
      message: 'Competition created successfully',
      data: { competitionId, competition_code }
    });
  } catch (error) {
    await connection.rollback();
    console.error('Create competition error:', error);
    res.status(500).json({ success: false, message: 'Failed to create competition' });
  } finally {
    connection.release();
  }
});

// Update competition
router.put('/:id', authenticateToken, isAdmin, [
  param('id').isInt().withMessage('Valid competition ID is required'),
  validate
], async (req, res) => {
  try {
    const competitionId = req.params.id;

    const [competitions] = await pool.execute('SELECT * FROM competitions WHERE id = ?', [competitionId]);
    if (competitions.length === 0) {
      return res.status(404).json({ success: false, message: 'Competition not found' });
    }

    const {
      competition_name, description, venue, address, city, state,
      start_date, end_date, registration_start_date, registration_end_date,
      max_teams, max_players_per_team, entry_fee, prize_pool, rules,
      organizer_name, organizer_contact, logo_url
    } = req.body;

    // COALESCE(?, col) leaves omitted fields alone, but mysql2 rejects `undefined`
    // bind parameters outright, so every optional value must become null first.
    const orNull = (v) => (v === undefined ? null : v);

    await pool.execute(
      `UPDATE competitions SET
        competition_name = COALESCE(?, competition_name),
        description = COALESCE(?, description),
        venue = COALESCE(?, venue),
        address = COALESCE(?, address),
        city = COALESCE(?, city),
        state = COALESCE(?, state),
        start_date = COALESCE(?, start_date),
        end_date = COALESCE(?, end_date),
        registration_start_date = COALESCE(?, registration_start_date),
        registration_end_date = COALESCE(?, registration_end_date),
        max_teams = COALESCE(?, max_teams),
        max_players_per_team = COALESCE(?, max_players_per_team),
        entry_fee = COALESCE(?, entry_fee),
        prize_pool = COALESCE(?, prize_pool),
        rules = COALESCE(?, rules),
        organizer_name = COALESCE(?, organizer_name),
        organizer_contact = COALESCE(?, organizer_contact),
        logo_url = COALESCE(?, logo_url)
       WHERE id = ?`,
      [competition_name, description, venue, address, city, state,
       start_date, end_date, registration_start_date, registration_end_date,
       max_teams, max_players_per_team, entry_fee, prize_pool, rules,
       organizer_name, organizer_contact, logo_url, competitionId].map(orNull)
    );

    await logActivity(req.user.id, 'COMPETITION_UPDATED', 'competitions', competitionId, competitions[0], req.body, req);

    res.json({ success: true, message: 'Competition updated successfully' });
  } catch (error) {
    console.error('Update competition error:', error);
    res.status(500).json({ success: false, message: 'Failed to update competition' });
  }
});

// Update competition status
router.patch('/:id/status', authenticateToken, isAdmin, [
  param('id').isInt().withMessage('Valid competition ID is required'),
  body('status').isIn(['draft', 'registration_open', 'registration_closed', 'ongoing', 'completed', 'cancelled']),
  validate
], async (req, res) => {
  try {
    const { status } = req.body;

    await pool.execute(
      'UPDATE competitions SET status = ? WHERE id = ?',
      [status, req.params.id]
    );

    await logActivity(req.user.id, 'COMPETITION_STATUS_CHANGED', 'competitions', req.params.id, null, { status }, req);

    res.json({ success: true, message: 'Competition status updated successfully' });
  } catch (error) {
    console.error('Update competition status error:', error);
    res.status(500).json({ success: false, message: 'Failed to update competition status' });
  }
});

// Add one or several categories to a competition.
// Accepts a single age_group_id, or age_group_ids for a whole batch of age groups
// against the same discipline. Age groups already present are skipped rather than
// failing the batch, so re-submitting a selection is safe.
router.post('/:id/categories', authenticateToken, isAdmin, [
  param('id').isInt().withMessage('Valid competition ID is required'),
  body('category').isIn(['pole', 'rope', 'hanging']).withMessage('Valid category is required'),
  body('age_group_id').optional().isInt().withMessage('Valid age group ID is required'),
  body('age_group_ids').optional().isArray({ min: 1 }).withMessage('Select at least one age group'),
  validate
], async (req, res) => {
  const connection = await pool.getConnection();
  let inTransaction = false;
  try {
    const { category, age_group_id, age_group_ids, max_participants } = req.body;

    const requested = [...new Set(
      (Array.isArray(age_group_ids) && age_group_ids.length ? age_group_ids : [age_group_id])
        .map((v) => parseInt(v, 10))
        .filter((v) => Number.isInteger(v))
    )];

    if (requested.length === 0) {
      return res.status(400).json({ success: false, message: 'Select at least one age group' });
    }

    const [validGroups] = await connection.execute(
      `SELECT id, group_name FROM age_groups
       WHERE id IN (${requested.map(() => '?').join(', ')})`,
      requested
    );

    const unknown = requested.filter((id) => !validGroups.some((g) => g.id === id));
    if (unknown.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Unknown age group: ${unknown.join(', ')}`
      });
    }

    const [existing] = await connection.execute(
      `SELECT cc.age_group_id, ag.group_name
       FROM competition_categories cc
       JOIN age_groups ag ON cc.age_group_id = ag.id
       WHERE cc.competition_id = ? AND cc.category = ?`,
      [req.params.id, category]
    );
    const alreadyThere = existing.map((e) => e.age_group_id);
    const toAdd = requested.filter((id) => !alreadyThere.includes(id));

    if (toAdd.length === 0) {
      return res.status(400).json({
        success: false,
        message: `Already added for ${category}: ${existing
          .filter((e) => requested.includes(e.age_group_id))
          .map((e) => e.group_name.trim()).join(', ')}`
      });
    }

    await connection.beginTransaction();
    inTransaction = true;

    const added = [];
    for (const groupId of toAdd) {
      const [result] = await connection.execute(
        `INSERT INTO competition_categories (competition_id, category, age_group_id, max_participants)
         VALUES (?, ?, ?, ?)`,
        [req.params.id, category, groupId, max_participants || null]
      );
      added.push({
        categoryId: result.insertId,
        age_group_id: groupId,
        age_group_name: validGroups.find((g) => g.id === groupId)?.group_name?.trim()
      });
    }

    await connection.commit();
    inTransaction = false;

    await logActivity(
      req.user.id, 'COMPETITION_CATEGORIES_ADDED', 'competitions', req.params.id, null,
      { category, age_group_ids: toAdd }, req
    );

    const skipped = requested.length - toAdd.length;
    res.status(201).json({
      success: true,
      message: `${added.length} ${category} categor${added.length === 1 ? 'y' : 'ies'} added` +
        (skipped > 0 ? `, ${skipped} already present` : ''),
      data: { added, skipped, categoryId: added[0]?.categoryId }
    });
  } catch (error) {
    if (inTransaction) await connection.rollback();
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ success: false, message: 'This category already exists for this competition' });
    }
    console.error('Add category error:', error);
    res.status(500).json({ success: false, message: 'Failed to add category' });
  } finally {
    connection.release();
  }
});

// Get competition categories
router.get('/:id/categories', authenticateToken, async (req, res) => {
  try {
    const [categories] = await pool.execute(
      `SELECT cc.*, ag.group_name as age_group_name, ag.min_age, ag.max_age,
              (SELECT COUNT(*) FROM competition_entries WHERE competition_category_id = cc.id) as entry_count
       FROM competition_categories cc
       JOIN age_groups ag ON cc.age_group_id = ag.id
       WHERE cc.competition_id = ?`,
      [req.params.id]
    );

    res.json({ success: true, data: categories });
  } catch (error) {
    console.error('Get categories error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch categories' });
  }
});

// Registered teams with their squad, for the expandable list on the detail page.
// Each player carries their age group and a flag when that group names the other
// gender, so the mismatch is visible and can be corrected.
router.get('/:id/teams', authenticateToken, [
  param('id').isInt().withMessage('Valid competition ID is required'),
  validate
], async (req, res) => {
  try {
    const competitionId = req.params.id;

    const [teams] = await pool.execute(
      `SELECT cr.id AS registration_id, cr.team_id, cr.status AS registration_status,
              cr.registration_date, cr.payment_status, cr.draw_order,
              t.team_name, t.team_code, t.city, t.state, t.contact_phone, t.contact_email,
              t.manager_id, u.full_name AS manager_name
       FROM competition_registrations cr
       JOIN teams t ON cr.team_id = t.id
       LEFT JOIN users u ON t.manager_id = u.id
       WHERE cr.competition_id = ?
       ORDER BY t.team_name`,
      [competitionId]
    );

    // Who may edit which roster: an admin edits any team, a manager only their own
    // (under any of their accounts). Everyone else is read-only.
    const accountIds = await getPersonAccountIds(pool, req.user);

    if (teams.length === 0) {
      return res.json({ success: true, data: [] });
    }

    const teamIds = teams.map((t) => t.team_id);
    const [players] = await pool.execute(
      `SELECT p.id, p.team_id, p.first_name, p.last_name, p.gender, p.category,
              p.date_of_birth, p.registration_number, p.age_group_id, p.is_active,
              ag.group_name AS age_group_name,
              EXISTS (
                SELECT 1 FROM competition_entries ce
                WHERE ce.player_id = p.id AND ce.competition_id = ?
                  AND ce.status <> 'withdrawn'
              ) AS is_entered
       FROM players p
       LEFT JOIN age_groups ag ON p.age_group_id = ag.id
       WHERE p.team_id IN (${teamIds.map(() => '?').join(', ')}) AND p.is_active = TRUE
       ORDER BY p.category, ag.min_age, p.first_name`,
      [competitionId, ...teamIds]
    );

    const enriched = players.map((p) => {
      const required = genderOfAgeGroup(p.age_group_name);
      return {
        ...p,
        player_name: `${p.first_name} ${p.last_name}`.trim(),
        is_entered: Boolean(p.is_entered),
        age_group_gender: required,
        gender_mismatch: required !== null && p.gender !== required
      };
    });

    res.json({
      success: true,
      data: teams.map((team) => {
        const squad = enriched.filter((p) => p.team_id === team.team_id);
        return {
          ...team,
          can_edit: ownsRecord(req.user, team.manager_id, accountIds),
          player_count: squad.length,
          entered_count: squad.filter((p) => p.is_entered).length,
          mismatch_count: squad.filter((p) => p.gender_mismatch).length,
          players: squad
        };
      })
    });
  } catch (error) {
    console.error('Get competition teams error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch registered teams' });
  }
});

// =====================================================
// JUDGE REGISTRATION
// =====================================================

// Active competitions with the calling judge's own registration state.
// Drives the "Register" button on the judge dashboard.
router.get('/judge/active', authenticateToken, async (req, res) => {
  try {
    const [competitions] = await pool.execute(
      `SELECT c.id, c.competition_name, c.competition_code, c.venue, c.city, c.state,
              c.start_date, c.end_date, c.status,
              (SELECT COUNT(*) FROM competition_judges cj
                WHERE cj.competition_id = c.id AND cj.status = 'registered') AS registered_judges,
              (SELECT COUNT(*) FROM competition_judges cj
                WHERE cj.competition_id = c.id AND cj.judge_id = ? AND cj.status = 'registered') AS is_registered
       FROM competitions c
       WHERE c.is_active = TRUE AND c.status IN (${activeStatusPlaceholders})
       ORDER BY c.start_date`,
      [req.user.id, ...ACTIVE_COMPETITION_STATUSES]
    );

    res.json({
      success: true,
      data: competitions.map((c) => ({ ...c, is_registered: c.is_registered > 0 }))
    });
  } catch (error) {
    console.error('Get judge active competitions error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch competitions' });
  }
});

// Judges registered for a competition, each with any panel slots they hold
router.get('/:id/judges', authenticateToken, [
  param('id').isInt().withMessage('Valid competition ID is required'),
  validate
], async (req, res) => {
  try {
    const competitionId = req.params.id;

    const [judges] = await pool.execute(
      `SELECT cj.id AS registration_id, cj.judge_id, cj.status, cj.registered_at,
              u.username, u.full_name, u.email, u.phone, u.role
       FROM competition_judges cj
       JOIN users u ON cj.judge_id = u.id
       WHERE cj.competition_id = ? AND cj.status = 'registered'
       ORDER BY cj.registered_at`,
      [competitionId]
    );

    // Which panel slots each registered judge already holds in this competition
    const [assignments] = await pool.execute(
      `SELECT pm.judge_id, pm.position, jp.id AS panel_id, jp.panel_name
       FROM panel_members pm
       JOIN judge_panels jp ON pm.panel_id = jp.id
       WHERE jp.competition_id = ? AND pm.is_active = TRUE AND jp.is_active = TRUE`,
      [competitionId]
    );

    res.json({
      success: true,
      data: judges.map((j) => ({
        ...j,
        assignments: assignments.filter((a) => a.judge_id === j.judge_id)
      }))
    });
  } catch (error) {
    console.error('Get competition judges error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch registered judges' });
  }
});

// Register the calling judge for a competition
router.post('/:id/judges/register', authenticateToken, [
  param('id').isInt().withMessage('Valid competition ID is required'),
  validate
], async (req, res) => {
  try {
    const competitionId = req.params.id;

    if (!PANEL_ELIGIBLE_ROLES.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Only judges and scorers can register for a competition'
      });
    }

    const [competitions] = await pool.execute(
      'SELECT id, competition_name, status FROM competitions WHERE id = ? AND is_active = TRUE',
      [competitionId]
    );

    if (competitions.length === 0) {
      return res.status(404).json({ success: false, message: 'Competition not found' });
    }

    if (!ACTIVE_COMPETITION_STATUSES.includes(competitions[0].status)) {
      return res.status(400).json({
        success: false,
        message: 'This competition is not open for judge registration'
      });
    }

    const [existing] = await pool.execute(
      'SELECT id, status FROM competition_judges WHERE competition_id = ? AND judge_id = ?',
      [competitionId, req.user.id]
    );

    if (existing.length > 0 && existing[0].status === 'registered') {
      return res.json({
        success: true,
        message: 'You are already registered for this competition',
        data: { alreadyRegistered: true }
      });
    }

    if (existing.length > 0) {
      // Re-registering after a withdrawal flips the existing row back
      await pool.execute(
        `UPDATE competition_judges SET status = 'registered' WHERE id = ?`,
        [existing[0].id]
      );
    } else {
      try {
        await pool.execute(
          `INSERT INTO competition_judges (competition_id, judge_id, status)
           VALUES (?, ?, 'registered')`,
          [competitionId, req.user.id]
        );
      } catch (insertError) {
        // Two simultaneous registrations raced; the other one won, which is fine
        if (insertError.code !== 'ER_DUP_ENTRY') throw insertError;
        return res.json({
          success: true,
          message: 'You are already registered for this competition',
          data: { alreadyRegistered: true }
        });
      }
    }

    await logActivity(
      req.user.id, 'JUDGE_REGISTERED_FOR_COMPETITION', 'competitions', competitionId,
      null, { judge_id: req.user.id, competition_name: competitions[0].competition_name }, req
    );

    res.status(201).json({
      success: true,
      message: `Registered for ${competitions[0].competition_name}`,
      data: { alreadyRegistered: false }
    });
  } catch (error) {
    console.error('Judge register error:', error);
    res.status(500).json({ success: false, message: 'Failed to register for competition' });
  }
});

// Judge/scorer accounts eligible to be registered for a competition by an admin,
// each flagged with whether they are already registered.
router.get('/:id/eligible-judges', authenticateToken, isAdmin, [
  param('id').isInt().withMessage('Valid competition ID is required'),
  validate
], async (req, res) => {
  try {
    const [users] = await pool.execute(
      `SELECT u.id, u.username, u.full_name, u.email, u.phone, u.role,
              (SELECT COUNT(*) FROM competition_judges cj
                WHERE cj.competition_id = ? AND cj.judge_id = u.id
                  AND cj.status = 'registered') AS is_registered
       FROM users u
       WHERE u.is_active = TRUE AND u.role IN (${PANEL_ELIGIBLE_ROLES.map(() => '?').join(', ')})
       ORDER BY u.full_name`,
      [req.params.id, ...PANEL_ELIGIBLE_ROLES]
    );

    res.json({
      success: true,
      data: users.map((u) => ({ ...u, is_registered: u.is_registered > 0 }))
    });
  } catch (error) {
    console.error('Get eligible judges error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch eligible judges' });
  }
});

// Admin registers a judge for a competition on their behalf
router.post('/:id/judges', authenticateToken, isAdmin, [
  param('id').isInt().withMessage('Valid competition ID is required'),
  body('judge_id').isInt().withMessage('Judge is required'),
  validate
], async (req, res) => {
  try {
    const competitionId = req.params.id;
    const { judge_id } = req.body;

    const [competitions] = await pool.execute(
      'SELECT id, competition_name, status FROM competitions WHERE id = ? AND is_active = TRUE',
      [competitionId]
    );

    if (competitions.length === 0) {
      return res.status(404).json({ success: false, message: 'Competition not found' });
    }

    if (!ACTIVE_COMPETITION_STATUSES.includes(competitions[0].status)) {
      return res.status(400).json({
        success: false,
        message: 'This competition is not open for judge registration'
      });
    }

    const [users] = await pool.execute(
      'SELECT id, full_name, role FROM users WHERE id = ? AND is_active = TRUE',
      [judge_id]
    );

    if (users.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    if (!PANEL_ELIGIBLE_ROLES.includes(users[0].role)) {
      return res.status(400).json({
        success: false,
        message: `${users[0].full_name} is a ${users[0].role.replace('_', ' ')}. Only judges and scorers can be registered.`
      });
    }

    const [existing] = await pool.execute(
      'SELECT id, status FROM competition_judges WHERE competition_id = ? AND judge_id = ?',
      [competitionId, judge_id]
    );

    if (existing.length > 0 && existing[0].status === 'registered') {
      return res.json({
        success: true,
        message: `${users[0].full_name} is already registered`,
        data: { alreadyRegistered: true }
      });
    }

    if (existing.length > 0) {
      await pool.execute(
        `UPDATE competition_judges SET status = 'registered' WHERE id = ?`,
        [existing[0].id]
      );
    } else {
      try {
        await pool.execute(
          `INSERT INTO competition_judges (competition_id, judge_id, status)
           VALUES (?, ?, 'registered')`,
          [competitionId, judge_id]
        );
      } catch (insertError) {
        if (insertError.code !== 'ER_DUP_ENTRY') throw insertError;
        return res.json({
          success: true,
          message: `${users[0].full_name} is already registered`,
          data: { alreadyRegistered: true }
        });
      }
    }

    await logActivity(
      req.user.id, 'JUDGE_REGISTERED_BY_ADMIN', 'competitions', competitionId,
      null, { judge_id: Number(judge_id), competition_name: competitions[0].competition_name }, req
    );

    res.status(201).json({
      success: true,
      message: `${users[0].full_name} registered for ${competitions[0].competition_name}`,
      data: { alreadyRegistered: false }
    });
  } catch (error) {
    console.error('Admin register judge error:', error);
    res.status(500).json({ success: false, message: 'Failed to register judge' });
  }
});

// Withdraw the calling judge from a competition.
// MUST stay ahead of DELETE /:id/judges/:judgeId, or "register" is captured as a
// judgeId and the admin-only handler rejects a judge withdrawing themselves.
router.delete('/:id/judges/register', authenticateToken, [
  param('id').isInt().withMessage('Valid competition ID is required'),
  validate
], async (req, res) => {
  try {
    const competitionId = req.params.id;

    // A judge already sitting on a panel can't just vanish from it
    const [assigned] = await pool.execute(
      `SELECT jp.panel_name, pm.position
       FROM panel_members pm
       JOIN judge_panels jp ON pm.panel_id = jp.id
       WHERE jp.competition_id = ? AND pm.judge_id = ? AND pm.is_active = TRUE AND jp.is_active = TRUE`,
      [competitionId, req.user.id]
    );

    if (assigned.length > 0) {
      return res.status(400).json({
        success: false,
        message: `You are assigned to panel "${assigned[0].panel_name}". Ask the admin to remove you from it before withdrawing.`
      });
    }

    const [result] = await pool.execute(
      `UPDATE competition_judges SET status = 'withdrawn'
       WHERE competition_id = ? AND judge_id = ? AND status = 'registered'`,
      [competitionId, req.user.id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: 'You are not registered for this competition'
      });
    }

    await logActivity(
      req.user.id, 'JUDGE_WITHDREW_FROM_COMPETITION', 'competitions', competitionId,
      null, { judge_id: req.user.id }, req
    );

    res.json({ success: true, message: 'Withdrawn from competition' });
  } catch (error) {
    console.error('Judge withdraw error:', error);
    res.status(500).json({ success: false, message: 'Failed to withdraw from competition' });
  }
});

// Admin removes a judge's registration. Registered after the /register route above
// so that the literal path wins over this wildcard.
router.delete('/:id/judges/:judgeId', authenticateToken, isAdmin, [
  param('id').isInt().withMessage('Valid competition ID is required'),
  param('judgeId').isInt().withMessage('Valid judge ID is required'),
  validate
], async (req, res) => {
  try {
    const { id: competitionId, judgeId } = req.params;

    const [assigned] = await pool.execute(
      `SELECT jp.panel_name, pm.position
       FROM panel_members pm
       JOIN judge_panels jp ON pm.panel_id = jp.id
       WHERE jp.competition_id = ? AND pm.judge_id = ? AND pm.is_active = TRUE AND jp.is_active = TRUE`,
      [competitionId, judgeId]
    );

    if (assigned.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Assigned to panel "${assigned[0].panel_name}". Remove them from it first.`
      });
    }

    const [result] = await pool.execute(
      `UPDATE competition_judges SET status = 'withdrawn'
       WHERE competition_id = ? AND judge_id = ? AND status = 'registered'`,
      [competitionId, judgeId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: 'That judge is not registered' });
    }

    await logActivity(
      req.user.id, 'JUDGE_REGISTRATION_REMOVED_BY_ADMIN', 'competitions', competitionId,
      null, { judge_id: Number(judgeId) }, req
    );

    res.json({ success: true, message: 'Registration removed' });
  } catch (error) {
    console.error('Admin remove judge registration error:', error);
    res.status(500).json({ success: false, message: 'Failed to remove registration' });
  }
});

// Get ongoing/open competitions
router.get('/status/active', async (req, res) => {
  try {
    const [competitions] = await pool.execute(
      `SELECT c.*, 
              (SELECT COUNT(DISTINCT team_id) FROM competition_registrations WHERE competition_id = c.id AND status = 'approved') as registered_teams
       FROM competitions c
       WHERE c.status IN ('registration_open', 'ongoing') AND c.is_active = TRUE
       ORDER BY c.start_date`
    );

    res.json({ success: true, data: competitions });
  } catch (error) {
    console.error('Get active competitions error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch competitions' });
  }
});

module.exports = router;
