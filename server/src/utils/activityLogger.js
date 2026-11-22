const { pool } = require('../config/database');

const logActivity = async (userId, action, entityType, entityId, oldValue = null, newValue = null, req = null) => {
  try {
    await pool.execute(
      `INSERT INTO activity_logs (user_id, action, entity_type, entity_id, old_value, new_value, ip_address, user_agent)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        userId,
        action,
        entityType,
        entityId,
        oldValue ? JSON.stringify(oldValue) : null,
        newValue ? JSON.stringify(newValue) : null,
        req?.ip || null,
        req?.headers['user-agent'] || null
      ]
    );
  } catch (error) {
    console.error('Error logging activity:', error);
  }
};

module.exports = { logActivity };
