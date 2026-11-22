const express = require('express');
const router = express.Router();
const { body, param } = require('express-validator');
const { pool } = require('../config/database');
const { validate } = require('../middleware/validation.middleware');
const { authenticateToken, isTeamManager, isAdmin } = require('../middleware/auth.middleware');
const { logActivity } = require('../utils/activityLogger');
const { getPersonAccountIds, ownsRecord } = require('../utils/accountIdentity');

// Get all registrations for a competition
router.get('/competition/:competitionId', authenticateToken, async (req, res) => {
  try {
    const [registrations] = await pool.execute(
      `SELECT cr.*, t.team_name, t.team_code, u.full_name as manager_name
       FROM competition_registrations cr
       JOIN teams t ON cr.team_id = t.id
       LEFT JOIN users u ON t.manager_id = u.id
       WHERE cr.competition_id = ?
       ORDER BY cr.registration_date`,
      [req.params.competitionId]
    );

    res.json({ success: true, data: registrations });
  } catch (error) {
    console.error('Get registrations error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch registrations' });
  }
});

// Get team's registrations
router.get('/team/:teamId', authenticateToken, async (req, res) => {
  try {
    const [registrations] = await pool.execute(
      `SELECT cr.*, c.competition_name, c.start_date, c.end_date, c.status as competition_status
       FROM competition_registrations cr
       JOIN competitions c ON cr.competition_id = c.id
       WHERE cr.team_id = ?
       ORDER BY cr.registration_date DESC`,
      [req.params.teamId]
    );

    res.json({ success: true, data: registrations });
  } catch (error) {
    console.error('Get team registrations error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch registrations' });
  }
});

// Register team for competition
router.post('/', authenticateToken, isTeamManager, [
  body('competition_id').isInt().withMessage('Competition ID is required'),
  body('team_id').isInt().withMessage('Team ID is required'),
  body('player_entries').isArray({ min: 1 }).withMessage('At least one player entry is required'),
  validate
], async (req, res) => {
  const connection = await pool.getConnection();
  try {
    const { competition_id, team_id, player_entries, payment_reference } = req.body;

    // Verify team ownership
    const [teams] = await connection.execute('SELECT * FROM teams WHERE id = ?', [team_id]);
    if (teams.length === 0) {
      return res.status(404).json({ success: false, message: 'Team not found' });
    }
    if (!ownsRecord(req.user, teams[0].manager_id, await getPersonAccountIds(pool, req.user))) {
      return res.status(403).json({ success: false, message: 'Unauthorized' });
    }

    // Check competition status
    const [competitions] = await connection.execute(
      'SELECT * FROM competitions WHERE id = ? AND status = "registration_open"',
      [competition_id]
    );
    if (competitions.length === 0) {
      return res.status(400).json({ success: false, message: 'Competition is not open for registration' });
    }

    // Check if already registered
    const [existing] = await connection.execute(
      'SELECT id FROM competition_registrations WHERE competition_id = ? AND team_id = ?',
      [competition_id, team_id]
    );
    if (existing.length > 0) {
      return res.status(400).json({ success: false, message: 'Team is already registered for this competition' });
    }

    await connection.beginTransaction();

    // Create registration
    const [regResult] = await connection.execute(
      `INSERT INTO competition_registrations (competition_id, team_id, payment_amount, payment_reference, status)
       VALUES (?, ?, ?, ?, 'pending')`,
      [competition_id, team_id, competitions[0].entry_fee, payment_reference || null]
    );

    const registrationId = regResult.insertId;

    // Add player entries
    for (const entry of player_entries) {
      // Verify player belongs to team
      const [players] = await connection.execute(
        'SELECT id, age_group_id FROM players WHERE id = ? AND team_id = ?',
        [entry.player_id, team_id]
      );

      if (players.length === 0) {
        throw new Error(`Player ${entry.player_id} does not belong to this team`);
      }

      // Verify category exists for competition
      const [categories] = await connection.execute(
        'SELECT id FROM competition_categories WHERE competition_id = ? AND id = ?',
        [competition_id, entry.competition_category_id]
      );

      if (categories.length === 0) {
        throw new Error(`Invalid competition category: ${entry.competition_category_id}`);
      }

      // Check if player is already registered in this category
      const [existingEntry] = await connection.execute(
        'SELECT id FROM competition_entries WHERE competition_id = ? AND player_id = ? AND competition_category_id = ?',
        [competition_id, entry.player_id, entry.competition_category_id]
      );

      if (existingEntry.length > 0) {
        throw new Error(`Player is already registered in this category`);
      }

      await connection.execute(
        `INSERT INTO competition_entries (competition_id, registration_id, player_id, competition_category_id, status)
         VALUES (?, ?, ?, ?, 'registered')`,
        [competition_id, registrationId, entry.player_id, entry.competition_category_id]
      );
    }

    await connection.commit();

    await logActivity(req.user.id, 'TEAM_REGISTERED', 'competition_registrations', registrationId, null, req.body, req);

    res.status(201).json({
      success: true,
      message: 'Team registered successfully',
      data: { registrationId }
    });
  } catch (error) {
    await connection.rollback();
    console.error('Registration error:', error);
    res.status(500).json({ success: false, message: error.message || 'Failed to register team' });
  } finally {
    connection.release();
  }
});

// Update registration status (admin)
router.patch('/:id/status', authenticateToken, isAdmin, [
  param('id').isInt().withMessage('Valid registration ID is required'),
  body('status').isIn(['pending', 'approved', 'rejected', 'withdrawn']).withMessage('Valid status is required'),
  validate
], async (req, res) => {
  try {
    const { status, remarks } = req.body;

    await pool.execute(
      `UPDATE competition_registrations 
       SET status = ?, remarks = ?, approved_by = ?, approved_at = NOW()
       WHERE id = ?`,
      [status, remarks, req.user.id, req.params.id]
    );

    // Update all entries status if approved
    if (status === 'approved') {
      await pool.execute(
        `UPDATE competition_entries SET status = 'confirmed' WHERE registration_id = ?`,
        [req.params.id]
      );
    }

    await logActivity(req.user.id, 'REGISTRATION_STATUS_CHANGED', 'competition_registrations', req.params.id, null, { status, remarks }, req);

    res.json({ success: true, message: 'Registration status updated successfully' });
  } catch (error) {
    console.error('Update registration status error:', error);
    res.status(500).json({ success: false, message: 'Failed to update registration status' });
  }
});

// Get registration entries (players)
router.get('/:id/entries', authenticateToken, async (req, res) => {
  try {
    const [entries] = await pool.execute(
      `SELECT ce.*, 
              CONCAT(p.first_name, ' ', p.last_name) as player_name,
              p.registration_number,
              cc.category,
              ag.group_name as age_group_name
       FROM competition_entries ce
       JOIN players p ON ce.player_id = p.id
       JOIN competition_categories cc ON ce.competition_category_id = cc.id
       JOIN age_groups ag ON cc.age_group_id = ag.id
       WHERE ce.registration_id = ?`,
      [req.params.id]
    );

    res.json({ success: true, data: entries });
  } catch (error) {
    console.error('Get entries error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch entries' });
  }
});

// Add player to registration
router.post('/:id/entries', authenticateToken, isTeamManager, [
  param('id').isInt().withMessage('Valid registration ID is required'),
  body('player_id').isInt().withMessage('Player ID is required'),
  body('competition_category_id').isInt().withMessage('Category ID is required'),
  validate
], async (req, res) => {
  try {
    const { player_id, competition_category_id } = req.body;
    const registrationId = req.params.id;

    // Get registration details
    const [registrations] = await pool.execute(
      `SELECT cr.*, t.manager_id 
       FROM competition_registrations cr
       JOIN teams t ON cr.team_id = t.id
       WHERE cr.id = ?`,
      [registrationId]
    );

    if (registrations.length === 0) {
      return res.status(404).json({ success: false, message: 'Registration not found' });
    }

    if (!ownsRecord(req.user, registrations[0].manager_id, await getPersonAccountIds(pool, req.user))) {
      return res.status(403).json({ success: false, message: 'Unauthorized' });
    }

    const [result] = await pool.execute(
      `INSERT INTO competition_entries (competition_id, registration_id, player_id, competition_category_id, status)
       VALUES (?, ?, ?, ?, 'registered')`,
      [registrations[0].competition_id, registrationId, player_id, competition_category_id]
    );

    res.status(201).json({
      success: true,
      message: 'Player added to registration',
      data: { entryId: result.insertId }
    });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ success: false, message: 'Player is already registered in this category' });
    }
    console.error('Add entry error:', error);
    res.status(500).json({ success: false, message: 'Failed to add player' });
  }
});

// Remove player from registration
router.delete('/:id/entries/:entryId', authenticateToken, isTeamManager, async (req, res) => {
  try {
    await pool.execute('DELETE FROM competition_entries WHERE id = ? AND registration_id = ?', 
      [req.params.entryId, req.params.id]);
    
    res.json({ success: true, message: 'Player removed from registration' });
  } catch (error) {
    console.error('Remove entry error:', error);
    res.status(500).json({ success: false, message: 'Failed to remove player' });
  }
});

// Withdraw registration
router.post('/:id/withdraw', authenticateToken, isTeamManager, async (req, res) => {
  try {
    const [registrations] = await pool.execute(
      `SELECT cr.*, t.manager_id 
       FROM competition_registrations cr
       JOIN teams t ON cr.team_id = t.id
       WHERE cr.id = ?`,
      [req.params.id]
    );

    if (registrations.length === 0) {
      return res.status(404).json({ success: false, message: 'Registration not found' });
    }

    if (!ownsRecord(req.user, registrations[0].manager_id, await getPersonAccountIds(pool, req.user))) {
      return res.status(403).json({ success: false, message: 'Unauthorized' });
    }

    await pool.execute(
      `UPDATE competition_registrations SET status = 'withdrawn' WHERE id = ?`,
      [req.params.id]
    );

    await pool.execute(
      `UPDATE competition_entries SET status = 'withdrawn' WHERE registration_id = ?`,
      [req.params.id]
    );

    await logActivity(req.user.id, 'REGISTRATION_WITHDRAWN', 'competition_registrations', req.params.id, null, null, req);

    res.json({ success: true, message: 'Registration withdrawn successfully' });
  } catch (error) {
    console.error('Withdraw registration error:', error);
    res.status(500).json({ success: false, message: 'Failed to withdraw registration' });
  }
});

module.exports = router;
