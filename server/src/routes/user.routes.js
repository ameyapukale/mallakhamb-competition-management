const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { body, param, query } = require('express-validator');
const { pool } = require('../config/database');
const { validate } = require('../middleware/validation.middleware');
const { authenticateToken, isAdmin } = require('../middleware/auth.middleware');
const { logActivity } = require('../utils/activityLogger');

// Get all users (admin only)
router.get('/', authenticateToken, isAdmin, async (req, res) => {
  try {
    const { role, is_active } = req.query;
    let query = 'SELECT id, username, email, role, full_name, phone, is_active, created_at FROM users WHERE 1=1';
    const params = [];

    if (role) {
      query += ' AND role = ?';
      params.push(role);
    }
    if (is_active !== undefined) {
      query += ' AND is_active = ?';
      params.push(is_active === 'true');
    }

    query += ' ORDER BY created_at DESC';

    const [users] = await pool.execute(query, params);
    res.json({ success: true, data: users });
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch users' });
  }
});

// Get user by ID
router.get('/:id', authenticateToken, [
  param('id').isInt().withMessage('Valid user ID is required'),
  validate
], async (req, res) => {
  try {
    const [users] = await pool.execute(
      'SELECT id, username, email, role, full_name, phone, is_active, created_at FROM users WHERE id = ?',
      [req.params.id]
    );

    if (users.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    res.json({ success: true, data: users[0] });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch user' });
  }
});

// Update user. Admins may change username, email, full name, phone and role;
// a user editing themselves may change only their own contact details.
router.put('/:id', authenticateToken, [
  param('id').isInt().withMessage('Valid user ID is required'),
  body('username').optional().trim().isLength({ min: 3 })
    .withMessage('Username must be at least 3 characters'),
  body('email').optional().isEmail().normalizeEmail().withMessage('Valid email is required'),
  body('full_name').optional().trim().notEmpty().withMessage('Full name cannot be empty'),
  body('phone').optional({ nullable: true }).trim(),
  body('role').optional().isIn(['admin', 'team_manager', 'judge'])
    .withMessage('Valid role is required'),
  validate
], async (req, res) => {
  try {
    const userId = parseInt(req.params.id, 10);
    const isAdminUser = req.user.role === 'admin';

    if (!isAdminUser && req.user.id !== userId) {
      return res.status(403).json({ success: false, message: 'Unauthorized' });
    }

    const { username, email, full_name, phone, role } = req.body;

    if (!isAdminUser && (username !== undefined || role !== undefined)) {
      return res.status(403).json({
        success: false,
        message: 'Only an admin can change a username or role'
      });
    }

    const [current] = await pool.execute('SELECT * FROM users WHERE id = ?', [userId]);
    if (current.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    const existingUser = current[0];

    // Values after the edit, used for the uniqueness and integrity checks below
    const nextUsername = username ?? existingUser.username;
    const nextEmail = email ?? existingUser.email;
    const nextRole = role ?? existingUser.role;

    // An admin must not strip their own admin rights and lock everyone out
    if (isAdminUser && userId === req.user.id && nextRole !== 'admin') {
      return res.status(400).json({
        success: false,
        message: 'You cannot change your own role away from admin'
      });
    }

    if (nextRole !== existingUser.role) {
      // Panel work assumes the person is still a judge or scorer
      const [panels] = await pool.execute(
        `SELECT jp.panel_name FROM panel_members pm
         JOIN judge_panels jp ON pm.panel_id = jp.id
         WHERE pm.judge_id = ? AND pm.is_active = TRUE AND jp.is_active = TRUE`,
        [userId]
      );

      if (panels.length > 0 && nextRole !== 'judge') {
        return res.status(400).json({
          success: false,
          message: `${existingUser.full_name} is on panel "${panels[0].panel_name}". Remove them from it before changing their role to ${nextRole.replace('_', ' ')}.`
        });
      }

      const [registrations] = await pool.execute(
        `SELECT c.competition_name FROM competition_judges cj
         JOIN competitions c ON cj.competition_id = c.id
         WHERE cj.judge_id = ? AND cj.status = 'registered'`,
        [userId]
      );

      if (registrations.length > 0 && nextRole !== 'judge') {
        return res.status(400).json({
          success: false,
          message: `${existingUser.full_name} is registered as a judge for "${registrations[0].competition_name}". Remove that registration before changing their role to ${nextRole.replace('_', ' ')}.`
        });
      }
    }

    // Uniqueness is per role, so check the target role rather than globally
    const [clashes] = await pool.execute(
      `SELECT username, email FROM users
       WHERE id <> ? AND role = ? AND (username = ? OR email = ?)`,
      [userId, nextRole, nextUsername, nextEmail]
    );

    if (clashes.length > 0) {
      const field = clashes[0].username === nextUsername ? 'username' : 'email';
      return res.status(400).json({
        success: false,
        message: `Another ${nextRole.replace('_', ' ')} account already uses that ${field}`
      });
    }

    await pool.execute(
      `UPDATE users SET username = ?, email = ?, full_name = ?, phone = ?, role = ?
       WHERE id = ?`,
      [
        nextUsername,
        nextEmail,
        full_name ?? existingUser.full_name,
        phone === undefined ? existingUser.phone : (phone || null),
        nextRole,
        userId
      ]
    );

    await logActivity(req.user.id, 'USER_UPDATED', 'users', userId, existingUser, req.body, req);

    const [updated] = await pool.execute(
      'SELECT id, username, email, role, full_name, phone, is_active FROM users WHERE id = ?',
      [userId]
    );

    res.json({ success: true, message: 'User updated successfully', data: updated[0] });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({
        success: false,
        message: 'Another account with that role already uses this username or email'
      });
    }
    console.error('Update user error:', error);
    res.status(500).json({ success: false, message: 'Failed to update user' });
  }
});

// Activate/Deactivate user (admin only)
router.patch('/:id/status', authenticateToken, isAdmin, [
  param('id').isInt().withMessage('Valid user ID is required'),
  body('is_active').isBoolean().withMessage('is_active must be boolean'),
  validate
], async (req, res) => {
  try {
    const { is_active } = req.body;

    await pool.execute(
      'UPDATE users SET is_active = ? WHERE id = ?',
      [is_active, req.params.id]
    );

    await logActivity(req.user.id, is_active ? 'USER_ACTIVATED' : 'USER_DEACTIVATED', 'users', req.params.id, null, null, req);

    res.json({ success: true, message: `User ${is_active ? 'activated' : 'deactivated'} successfully` });
  } catch (error) {
    console.error('Update user status error:', error);
    res.status(500).json({ success: false, message: 'Failed to update user status' });
  }
});

// Team managers who are free to take a new team, for the admin's Create Team form.
// One manager holds one team, so anyone already managing an active team is excluded.
//
// The check matches on username + email rather than user id: a person may hold an
// account per role, and a team created under any of them belongs to that person
// (see utils/accountIdentity.js). Without this, someone whose judge account owns a
// team would still be offered here.
router.get('/team-managers/available', authenticateToken, isAdmin, [
  query('team_id').optional().isInt().withMessage('Valid team ID is required'),
  validate
], async (req, res) => {
  try {
    // When editing a team, that team must not count against its own manager —
    // otherwise the current manager would be missing from their own dropdown.
    const excludeTeamId = req.query.team_id ? Number(req.query.team_id) : 0;

    const [available] = await pool.execute(
      `SELECT u.id, u.username, u.email, u.full_name, u.phone
       FROM users u
       WHERE u.role = 'team_manager' AND u.is_active = TRUE
         AND NOT EXISTS (
           SELECT 1 FROM teams t
           JOIN users owner ON t.manager_id = owner.id
           WHERE t.is_active = TRUE AND t.id <> ?
             AND owner.username = u.username AND owner.email = u.email
         )
       ORDER BY u.full_name`,
      [excludeTeamId]
    );

    // Returned for context so the form can explain who is missing and why
    const [assigned] = await pool.execute(
      `SELECT u.id, u.full_name, u.username,
              GROUP_CONCAT(DISTINCT t.team_name ORDER BY t.team_name) AS team_names
       FROM users u
       JOIN users owner ON owner.username = u.username AND owner.email = u.email
       JOIN teams t ON t.manager_id = owner.id AND t.is_active = TRUE AND t.id <> ?
       WHERE u.role = 'team_manager' AND u.is_active = TRUE
       GROUP BY u.id, u.full_name, u.username
       ORDER BY u.full_name`,
      [excludeTeamId]
    );

    res.json({
      success: true,
      data: {
        available,
        assigned: assigned.map((a) => ({
          ...a,
          teams: a.team_names ? a.team_names.split(',') : []
        }))
      }
    });
  } catch (error) {
    console.error('Get available team managers error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch available team managers' });
  }
});

// Get users by role (for dropdowns)
router.get('/role/:role', authenticateToken, async (req, res) => {
  try {
    const [users] = await pool.execute(
      'SELECT id, full_name, email FROM users WHERE role = ? AND is_active = TRUE',
      [req.params.role]
    );
    res.json({ success: true, data: users });
  } catch (error) {
    console.error('Get users by role error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch users' });
  }
});

module.exports = router;
