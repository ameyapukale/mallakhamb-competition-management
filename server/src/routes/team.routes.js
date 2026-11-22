const express = require('express');
const router = express.Router();
const { body, param } = require('express-validator');
const { pool } = require('../config/database');
const { validate } = require('../middleware/validation.middleware');
const { authenticateToken, isTeamManager, isAdmin } = require('../middleware/auth.middleware');
const { logActivity } = require('../utils/activityLogger');
const { v4: uuidv4 } = require('uuid');
const { getPersonAccountIds, ownsRecord } = require('../utils/accountIdentity');

// Get all teams
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { city, state, is_active } = req.query;
    let query = `
      SELECT t.*, u.full_name as manager_name, 
             (SELECT COUNT(*) FROM players WHERE team_id = t.id) as player_count
      FROM teams t
      LEFT JOIN users u ON t.manager_id = u.id
      WHERE 1=1
    `;
    const params = [];

    if (city) {
      query += ' AND t.city = ?';
      params.push(city);
    }
    if (state) {
      query += ' AND t.state = ?';
      params.push(state);
    }
    if (is_active !== undefined) {
      query += ' AND t.is_active = ?';
      params.push(is_active === 'true');
    }

    // A team manager sees their own teams — including any created under another of
    // their accounts, since one person can hold an account per role.
    if (req.user.role === 'team_manager') {
      const accountIds = await getPersonAccountIds(pool, req.user);
      query += ` AND t.manager_id IN (${accountIds.map(() => '?').join(', ')})`;
      params.push(...accountIds);
    }

    query += ' ORDER BY t.created_at DESC';

    const [teams] = await pool.execute(query, params);
    res.json({ success: true, data: teams });
  } catch (error) {
    console.error('Get teams error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch teams' });
  }
});

// Get team by ID
router.get('/:id', authenticateToken, [
  param('id').isInt().withMessage('Valid team ID is required'),
  validate
], async (req, res) => {
  try {
    const [teams] = await pool.execute(
      `SELECT t.*,
              u.full_name AS manager_name, u.username AS manager_username,
              u.email AS manager_email, u.phone AS manager_phone
       FROM teams t
       LEFT JOIN users u ON t.manager_id = u.id
       WHERE t.id = ?`,
      [req.params.id]
    );

    if (teams.length === 0) {
      return res.status(404).json({ success: false, message: 'Team not found' });
    }

    // Get team players
    const [players] = await pool.execute(
      `SELECT p.*, ag.group_name as age_group_name
       FROM players p
       LEFT JOIN age_groups ag ON p.age_group_id = ag.id
       WHERE p.team_id = ?`,
      [req.params.id]
    );

    res.json({ 
      success: true, 
      data: { ...teams[0], players } 
    });
  } catch (error) {
    console.error('Get team error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch team' });
  }
});

// Create team.
// A team manager creating a team manages it themselves. An admin must nominate the
// manager, who has to be a free team_manager — one manager holds one team.
router.post('/', authenticateToken, isTeamManager, [
  body('team_name').trim().notEmpty().withMessage('Team name is required'),
  body('organization_name').optional().trim(),
  body('city').optional().trim(),
  body('state').optional().trim(),
  body('manager_id').optional().isInt().withMessage('Valid team manager is required'),
  validate
], async (req, res) => {
  try {
    const {
      team_name, organization_name, address, city, state, country,
      contact_phone, contact_email, logo_url, manager_id
    } = req.body;

    let managerId = req.user.id;

    if (req.user.role === 'admin') {
      if (!manager_id) {
        return res.status(400).json({
          success: false,
          message: 'Select the team manager who will run this team'
        });
      }

      const [candidates] = await pool.execute(
        'SELECT id, username, email, full_name, role, is_active FROM users WHERE id = ?',
        [manager_id]
      );

      if (candidates.length === 0) {
        return res.status(404).json({ success: false, message: 'That user does not exist' });
      }

      const candidate = candidates[0];
      if (candidate.role !== 'team_manager' || !candidate.is_active) {
        return res.status(400).json({
          success: false,
          message: `${candidate.full_name} is not an active team manager`
        });
      }

      // One team per manager, counted across every account that person holds
      const [existingTeams] = await pool.execute(
        `SELECT t.team_name FROM teams t
         JOIN users owner ON t.manager_id = owner.id
         WHERE t.is_active = TRUE AND owner.username = ? AND owner.email = ?`,
        [candidate.username, candidate.email]
      );

      if (existingTeams.length > 0) {
        return res.status(400).json({
          success: false,
          message: `${candidate.full_name} already manages "${existingTeams[0].team_name}". Each manager can run only one team.`
        });
      }

      managerId = candidate.id;
    } else if (manager_id && Number(manager_id) !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Only an admin can assign a team to another manager'
      });
    }

    // Generate unique team code
    const team_code = `TM-${uuidv4().slice(0, 8).toUpperCase()}`;

    const [result] = await pool.execute(
      `INSERT INTO teams (team_name, team_code, organization_name, address, city, state, country, manager_id, contact_phone, contact_email, logo_url)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [team_name, team_code, organization_name || null, address || null, city || null, state || null, country || 'India', managerId, contact_phone || null, contact_email || null, logo_url || null]
    );

    await logActivity(req.user.id, 'TEAM_CREATED', 'teams', result.insertId, null, { ...req.body, manager_id: managerId }, req);

    res.status(201).json({
      success: true,
      message: 'Team created successfully',
      data: { teamId: result.insertId, team_code }
    });
  } catch (error) {
    console.error('Create team error:', error);
    res.status(500).json({ success: false, message: 'Failed to create team' });
  }
});

// Update team. The owning manager may change the team's details; only an admin may
// hand the team to a different manager, and the new one must not already run a team.
router.put('/:id', authenticateToken, isTeamManager, [
  param('id').isInt().withMessage('Valid team ID is required'),
  body('team_name').optional().trim().notEmpty().withMessage('Team name cannot be empty'),
  body('contact_email').optional({ nullable: true, checkFalsy: true }).isEmail()
    .withMessage('Valid contact email is required'),
  body('manager_id').optional().isInt().withMessage('Valid team manager is required'),
  validate
], async (req, res) => {
  try {
    const teamId = req.params.id;

    // Verify ownership
    const [teams] = await pool.execute('SELECT * FROM teams WHERE id = ?', [teamId]);
    if (teams.length === 0) {
      return res.status(404).json({ success: false, message: 'Team not found' });
    }

    const accountIds = await getPersonAccountIds(pool, req.user);
    if (!ownsRecord(req.user, teams[0].manager_id, accountIds)) {
      return res.status(403).json({ success: false, message: 'Unauthorized' });
    }

    const {
      team_name, organization_name, address, city, state, country,
      contact_phone, contact_email, logo_url, manager_id
    } = req.body;

    let nextManagerId = teams[0].manager_id;
    const changingManager = manager_id !== undefined && Number(manager_id) !== teams[0].manager_id;

    if (changingManager) {
      if (req.user.role !== 'admin') {
        return res.status(403).json({
          success: false,
          message: 'Only an admin can change who manages a team'
        });
      }

      const [candidates] = await pool.execute(
        'SELECT id, username, email, full_name, role, is_active FROM users WHERE id = ?',
        [manager_id]
      );

      if (candidates.length === 0) {
        return res.status(404).json({ success: false, message: 'That user does not exist' });
      }

      const candidate = candidates[0];
      if (candidate.role !== 'team_manager' || !candidate.is_active) {
        return res.status(400).json({
          success: false,
          message: `${candidate.full_name} is not an active team manager`
        });
      }

      // One team per manager. This team is excluded, so re-saving the same
      // manager is fine, and so is swapping between accounts of one person.
      const [otherTeams] = await pool.execute(
        `SELECT t.team_name FROM teams t
         JOIN users owner ON t.manager_id = owner.id
         WHERE t.is_active = TRUE AND t.id <> ?
           AND owner.username = ? AND owner.email = ?`,
        [teamId, candidate.username, candidate.email]
      );

      if (otherTeams.length > 0) {
        return res.status(400).json({
          success: false,
          message: `${candidate.full_name} already manages "${otherTeams[0].team_name}". Each manager can run only one team.`
        });
      }

      nextManagerId = candidate.id;
    }

    // COALESCE(?, col) leaves omitted fields alone, but mysql2 rejects `undefined`
    // bind parameters, so every optional value has to become null first.
    const orNull = (v) => (v === undefined ? null : v);

    await pool.execute(
      `UPDATE teams SET
        team_name = COALESCE(?, team_name),
        organization_name = COALESCE(?, organization_name),
        address = COALESCE(?, address),
        city = COALESCE(?, city),
        state = COALESCE(?, state),
        country = COALESCE(?, country),
        contact_phone = COALESCE(?, contact_phone),
        contact_email = COALESCE(?, contact_email),
        logo_url = COALESCE(?, logo_url),
        manager_id = ?
       WHERE id = ?`,
      [team_name, organization_name, address, city, state, country,
       contact_phone, contact_email, logo_url].map(orNull)
        .concat([nextManagerId, teamId])
    );

    await logActivity(
      req.user.id, changingManager ? 'TEAM_MANAGER_CHANGED' : 'TEAM_UPDATED',
      'teams', teamId, teams[0], { ...req.body, manager_id: nextManagerId }, req
    );

    const [updated] = await pool.execute(
      `SELECT t.*, u.full_name AS manager_name, u.username AS manager_username
       FROM teams t LEFT JOIN users u ON t.manager_id = u.id WHERE t.id = ?`,
      [teamId]
    );

    res.json({ success: true, message: 'Team updated successfully', data: updated[0] });
  } catch (error) {
    console.error('Update team error:', error);
    res.status(500).json({ success: false, message: 'Failed to update team' });
  }
});

// Delete team (soft delete)
router.delete('/:id', authenticateToken, isAdmin, [
  param('id').isInt().withMessage('Valid team ID is required'),
  validate
], async (req, res) => {
  try {
    await pool.execute('UPDATE teams SET is_active = FALSE WHERE id = ?', [req.params.id]);
    await logActivity(req.user.id, 'TEAM_DELETED', 'teams', req.params.id, null, null, req);
    res.json({ success: true, message: 'Team deleted successfully' });
  } catch (error) {
    console.error('Delete team error:', error);
    res.status(500).json({ success: false, message: 'Failed to delete team' });
  }
});

module.exports = router;
