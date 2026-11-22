const jwt = require('jsonwebtoken');
const { pool } = require('../config/database');

const authenticateToken = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ success: false, message: 'Access token required' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Get user from database
    const [users] = await pool.execute(
      'SELECT id, username, email, role, full_name, is_active FROM users WHERE id = ?',
      [decoded.userId]
    );

    if (users.length === 0 || !users[0].is_active) {
      return res.status(401).json({ success: false, message: 'Invalid or inactive user' });
    }

    req.user = users[0];
    next();
  } catch (error) {
    // 401, not 403: the caller is not authenticated at all. This is what tells the
    // client to clear the stale session and send the user back to sign in. Returning
    // 403 here left expired sessions looking logged in while every request failed,
    // so every list rendered empty. 403 is reserved for authorizeRoles, where the
    // user IS authenticated but lacks permission.
    const expired = error.name === 'TokenExpiredError';
    return res.status(401).json({
      success: false,
      message: expired ? 'Your session has expired. Please sign in again.' : 'Invalid or expired token',
      data: { tokenExpired: expired }
    });
  }
};

const authorizeRoles = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ 
        success: false, 
        message: 'You do not have permission to perform this action' 
      });
    }
    next();
  };
};

const isAdmin = authorizeRoles('admin');
const isTeamManager = authorizeRoles('admin', 'team_manager');
const isJudge = authorizeRoles('admin', 'judge');
// The 'scorer' account role was retired — judges do the scoring, so the guards
// that used to admit scorers now admit judges. The panel POSITION called Scorer
// is unaffected; that is a seat on a panel, not a role.
const isScorer = authorizeRoles('admin', 'judge');
const isJudgeOrScorer = authorizeRoles('admin', 'judge');

module.exports = { 
  authenticateToken, 
  authorizeRoles,
  isAdmin,
  isTeamManager,
  isJudge,
  isScorer,
  isJudgeOrScorer
};
