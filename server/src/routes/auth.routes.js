const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { body } = require('express-validator');
const { pool } = require('../config/database');
const { validate } = require('../middleware/validation.middleware');
const { authenticateToken, isAdmin } = require('../middleware/auth.middleware');
const { logActivity } = require('../utils/activityLogger');

const RESET_TOKEN_EXPIRES_IN = '15m';

// Fingerprint of the password hash the reset token was issued against. Checking it
// again at reset time makes each token single-use — once the password changes the
// fingerprint no longer matches — without needing a reset-token table.
const hashFingerprint = (passwordHash) =>
  crypto.createHash('sha256').update(passwordHash).digest('hex').slice(0, 16);

// Create a user account. Admin only: the admin is the only login in the
// simplified flow (teams register publicly without an account), so open
// self-sign-up is switched off.
router.post('/register', authenticateToken, isAdmin, [
  body('username').trim().isLength({ min: 3 }).withMessage('Username must be at least 3 characters'),
  body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  body('full_name').trim().notEmpty().withMessage('Full name is required'),
  // 'scorer' is retired: judges do the scoring, so it cannot be registered any more
  body('role').isIn(['team_manager', 'judge']).withMessage('Valid role is required'),
  validate
], async (req, res) => {
  try {
    const { username, email, password, full_name, role, phone } = req.body;

    // Username and email are unique per role, so a clash only matters within the
    // same role. The same person may register again under a different role.
    const [existing] = await pool.execute(
      `SELECT username, email FROM users
       WHERE role = ? AND (username = ? OR email = ?)`,
      [role, username, email]
    );

    if (existing.length > 0) {
      const roleLabel = role.replace('_', ' ');
      const clash = existing[0].username === username ? 'username' : 'email';
      return res.status(400).json({
        success: false,
        message: `That ${clash} is already registered as a ${roleLabel}. Pick a different role or ${clash}.`
      });
    }

    // Hash password
    const password_hash = await bcrypt.hash(password, 10);

    // Create user
    const [result] = await pool.execute(
      `INSERT INTO users (username, password_hash, email, role, full_name, phone)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [username, password_hash, email, role, full_name, phone || null]
    );

    await logActivity(result.insertId, 'USER_REGISTERED', 'users', result.insertId, null, { username, email, role }, req);

    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      data: { userId: result.insertId }
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ success: false, message: 'Registration failed' });
  }
});

// Step 1 of the multi-screen login: how many accounts does this identifier have?
// Returns the roles only when there is a genuine choice to make.
router.post('/login/identify', [
  body('identifier').trim().notEmpty().withMessage('Username or email is required'),
  validate
], async (req, res) => {
  try {
    const { identifier } = req.body;

    const [accounts] = await pool.execute(
      `SELECT role, username, full_name FROM users
       WHERE (username = ? OR email = ?) AND is_active = 1
       ORDER BY role`,
      [identifier, identifier]
    );

    // Stop here on an unknown login so the user is told at screen 1 rather than
    // being sent on to a password screen that can only fail.
    if (accounts.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No account found with that username or email'
      });
    }

    const requiresRoleSelection = accounts.length > 1;

    res.json({
      success: true,
      data: {
        identifier,
        requiresRoleSelection,
        accounts: requiresRoleSelection
          ? accounts.map((a) => ({ role: a.role, username: a.username, full_name: a.full_name }))
          : []
      }
    });
  } catch (error) {
    console.error('Login identify error:', error);
    res.status(500).json({ success: false, message: 'Failed to look up that login' });
  }
});

// Login.
// A username/email is unique only per role, so it can match several accounts. The client
// resolves that with /login/identify first and posts the chosen role here. Each account
// keeps its own password; the one for the chosen role is what gets verified.
router.post('/login', [
  body('username').trim().notEmpty().withMessage('Username is required'),
  body('password').notEmpty().withMessage('Password is required'),
  body('role').optional().isIn(['admin', 'team_manager', 'judge', 'scorer'])
    .withMessage('Valid role is required'),
  validate
], async (req, res) => {
  try {
    const { username, password, role } = req.body;

    // Accept the username or the email as the identifier
    const [candidates] = await pool.execute(
      'SELECT * FROM users WHERE (username = ? OR email = ?) AND is_active = 1',
      [username, username]
    );

    if (candidates.length === 0) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    // The identifier alone decides whether a role is needed, so the dropdown appears
    // whenever the username/email spans several roles, regardless of the password.
    if (candidates.length > 1 && !role) {
      return res.json({
        success: true,
        message: 'This login has more than one account. Choose which role to sign in as.',
        data: {
          requiresRoleSelection: true,
          roles: candidates
            .map((c) => ({ role: c.role, full_name: c.full_name, username: c.username }))
            .sort((a, b) => a.role.localeCompare(b.role))
        }
      });
    }

    let user;
    if (role) {
      user = candidates.find((c) => c.role === role);
      if (!user) {
        return res.status(401).json({
          success: false,
          message: 'No active account with that role uses this username'
        });
      }
    } else {
      user = candidates[0];
    }

    // Password is verified against the single chosen account
    if (!await bcrypt.compare(password, user.password_hash)) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    // Generate token
    const token = jwt.sign(
      { userId: user.id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
    );

    await logActivity(user.id, 'USER_LOGIN', 'users', user.id, null, null, req);

    res.json({
      success: true,
      message: 'Login successful',
      data: {
        token,
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          role: user.role,
          full_name: user.full_name
        }
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ success: false, message: 'Login failed' });
  }
});

// Get current user profile
router.get('/me', authenticateToken, async (req, res) => {
  res.json({ success: true, data: req.user });
});

// Change password
router.post('/change-password', authenticateToken, [
  body('currentPassword').notEmpty().withMessage('Current password is required'),
  body('newPassword').isLength({ min: 6 }).withMessage('New password must be at least 6 characters'),
  validate
], async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    // Get user with password
    const [users] = await pool.execute(
      'SELECT password_hash FROM users WHERE id = ?',
      [req.user.id]
    );

    // Verify current password
    const isValid = await bcrypt.compare(currentPassword, users[0].password_hash);
    if (!isValid) {
      return res.status(400).json({ success: false, message: 'Current password is incorrect' });
    }

    // Update password
    const newHash = await bcrypt.hash(newPassword, 10);
    await pool.execute(
      'UPDATE users SET password_hash = ? WHERE id = ?',
      [newHash, req.user.id]
    );

    await logActivity(req.user.id, 'PASSWORD_CHANGED', 'users', req.user.id, null, null, req);

    res.json({ success: true, message: 'Password changed successfully' });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ success: false, message: 'Failed to change password' });
  }
});

// Forgot password - step 1: confirm the email belongs to an account and issue a reset token.
// An email can now belong to one account per role, so when it matches several the
// caller must say which role to reset.
router.post('/forgot-password', [
  body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
  body('role').optional().isIn(['admin', 'team_manager', 'judge', 'scorer'])
    .withMessage('Valid role is required'),
  validate
], async (req, res) => {
  try {
    const { email, role } = req.body;

    const [users] = await pool.execute(
      `SELECT id, username, email, role, full_name, password_hash
       FROM users WHERE email = ? AND is_active = 1`,
      [email]
    );

    if (users.length === 0) {
      return res.status(404).json({ success: false, message: 'No active account found with that email' });
    }

    let user;
    if (role) {
      user = users.find((u) => u.role === role);
      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'No active account with that role uses this email'
        });
      }
    } else if (users.length > 1) {
      return res.json({
        success: true,
        message: 'This email has more than one account. Choose which one to reset.',
        data: {
          requiresAccountSelection: true,
          email,
          accounts: users
            .map((u) => ({ role: u.role, username: u.username, full_name: u.full_name }))
            .sort((a, b) => a.role.localeCompare(b.role))
        }
      });
    } else {
      user = users[0];
    }

    const resetToken = jwt.sign(
      { userId: user.id, purpose: 'password_reset', fp: hashFingerprint(user.password_hash) },
      process.env.JWT_SECRET,
      { expiresIn: RESET_TOKEN_EXPIRES_IN }
    );

    await logActivity(user.id, 'PASSWORD_RESET_REQUESTED', 'users', user.id, null, { email: user.email }, req);

    res.json({
      success: true,
      message: 'Email verified. You can now set a new password.',
      data: {
        resetToken,
        email: user.email,
        full_name: user.full_name,
        role: user.role,
        username: user.username
      }
    });
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({ success: false, message: 'Failed to verify email' });
  }
});

// Forgot password - step 2: set the new password for the verified email
router.post('/reset-password', [
  body('resetToken').notEmpty().withMessage('Reset token is required'),
  body('newPassword').isLength({ min: 6 }).withMessage('New password must be at least 6 characters'),
  validate
], async (req, res) => {
  try {
    const { resetToken, newPassword } = req.body;

    let payload;
    try {
      payload = jwt.verify(resetToken, process.env.JWT_SECRET);
    } catch (err) {
      return res.status(400).json({
        success: false,
        message: 'Your reset session has expired. Please enter your email again.'
      });
    }

    if (payload.purpose !== 'password_reset') {
      return res.status(400).json({ success: false, message: 'Invalid reset token' });
    }

    const [users] = await pool.execute(
      'SELECT id, email, password_hash FROM users WHERE id = ? AND is_active = 1',
      [payload.userId]
    );

    if (users.length === 0) {
      return res.status(404).json({ success: false, message: 'Account not found' });
    }

    const user = users[0];

    if (payload.fp !== hashFingerprint(user.password_hash)) {
      return res.status(400).json({
        success: false,
        message: 'This reset link has already been used. Please enter your email again.'
      });
    }

    const newHash = await bcrypt.hash(newPassword, 10);
    await pool.execute(
      'UPDATE users SET password_hash = ? WHERE id = ?',
      [newHash, user.id]
    );

    await logActivity(user.id, 'PASSWORD_RESET', 'users', user.id, null, { email: user.email }, req);

    res.json({
      success: true,
      message: 'Password reset successfully. Please sign in with your new password.'
    });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ success: false, message: 'Failed to reset password' });
  }
});

module.exports = router;
