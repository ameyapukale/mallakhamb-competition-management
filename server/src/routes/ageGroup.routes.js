const express = require('express');
const router = express.Router();
const { body, param } = require('express-validator');
const { pool } = require('../config/database');
const { validate } = require('../middleware/validation.middleware');
const { authenticateToken, isAdmin } = require('../middleware/auth.middleware');

// Get all age groups
router.get('/', authenticateToken, async (req, res) => {
  try {
    const [ageGroups] = await pool.execute(
      'SELECT * FROM age_groups WHERE is_active = TRUE ORDER BY min_age'
    );
    res.json({ success: true, data: ageGroups });
  } catch (error) {
    console.error('Get age groups error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch age groups' });
  }
});

// Get age group by ID
router.get('/:id', authenticateToken, [
  param('id').isInt().withMessage('Valid age group ID is required'),
  validate
], async (req, res) => {
  try {
    const [ageGroups] = await pool.execute(
      'SELECT * FROM age_groups WHERE id = ?',
      [req.params.id]
    );

    if (ageGroups.length === 0) {
      return res.status(404).json({ success: false, message: 'Age group not found' });
    }

    res.json({ success: true, data: ageGroups[0] });
  } catch (error) {
    console.error('Get age group error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch age group' });
  }
});

// Create age group (admin only)
router.post('/', authenticateToken, isAdmin, [
  body('group_name').trim().notEmpty().withMessage('Group name is required'),
  body('min_age').isInt({ min: 0 }).withMessage('Valid minimum age is required'),
  body('max_age').isInt({ min: 0 }).withMessage('Valid maximum age is required'),
  validate
], async (req, res) => {
  try {
    const { group_name, min_age, max_age, description } = req.body;

    if (Number(min_age) > Number(max_age)) {
      return res.status(400).json({ success: false, message: 'Minimum age cannot be greater than maximum age' });
    }

    const [result] = await pool.execute(
      `INSERT INTO age_groups (group_name, min_age, max_age, description)
       VALUES (?, ?, ?, ?)`,
      [group_name, min_age, max_age, description || null]
    );

    res.status(201).json({
      success: true,
      message: 'Age group created successfully',
      data: { ageGroupId: result.insertId }
    });
  } catch (error) {
    console.error('Create age group error:', error);
    res.status(500).json({ success: false, message: 'Failed to create age group' });
  }
});

// Update age group (admin only)
router.put('/:id', authenticateToken, isAdmin, [
  param('id').isInt().withMessage('Valid age group ID is required'),
  validate
], async (req, res) => {
  try {
    const { group_name, min_age, max_age, description } = req.body;

    if (min_age !== undefined && max_age !== undefined && Number(min_age) > Number(max_age)) {
      return res.status(400).json({ success: false, message: 'Minimum age cannot be greater than maximum age' });
    }

    await pool.execute(
      `UPDATE age_groups SET 
        group_name = COALESCE(?, group_name),
        min_age = COALESCE(?, min_age),
        max_age = COALESCE(?, max_age),
        description = COALESCE(?, description)
       WHERE id = ?`,
      [group_name, min_age, max_age, description, req.params.id]
    );

    res.json({ success: true, message: 'Age group updated successfully' });
  } catch (error) {
    console.error('Update age group error:', error);
    res.status(500).json({ success: false, message: 'Failed to update age group' });
  }
});

// Delete age group (soft delete - admin only)
router.delete('/:id', authenticateToken, isAdmin, [
  param('id').isInt().withMessage('Valid age group ID is required'),
  validate
], async (req, res) => {
  try {
    // Check if age group is in use
    const [inUse] = await pool.execute(
      'SELECT COUNT(*) as count FROM players WHERE age_group_id = ?',
      [req.params.id]
    );

    if (inUse[0].count > 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'Cannot delete age group that has players assigned' 
      });
    }

    await pool.execute('UPDATE age_groups SET is_active = FALSE WHERE id = ?', [req.params.id]);

    res.json({ success: true, message: 'Age group deleted successfully' });
  } catch (error) {
    console.error('Delete age group error:', error);
    res.status(500).json({ success: false, message: 'Failed to delete age group' });
  }
});

// Get age group for a specific age
router.get('/for-age/:age', authenticateToken, async (req, res) => {
  try {
    const [ageGroups] = await pool.execute(
      'SELECT * FROM age_groups WHERE min_age <= ? AND max_age >= ? AND is_active = TRUE LIMIT 1',
      [req.params.age, req.params.age]
    );

    if (ageGroups.length === 0) {
      return res.status(404).json({ success: false, message: 'No age group found for this age' });
    }

    res.json({ success: true, data: ageGroups[0] });
  } catch (error) {
    console.error('Get age group for age error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch age group' });
  }
});

module.exports = router;
