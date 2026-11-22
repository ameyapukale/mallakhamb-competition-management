const express = require('express');
const router = express.Router();
const { body, param } = require('express-validator');
const { pool } = require('../config/database');
const { validate } = require('../middleware/validation.middleware');
const { authenticateToken, isAdmin } = require('../middleware/auth.middleware');
const { logActivity } = require('../utils/activityLogger');

// Fisher-Yates shuffle algorithm
const shuffleArray = (array) => {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
};

// =====================================================
// TEAM LOTTERY — the drawn order of the teams in a competition
// =====================================================

// Every registered team, with its drawn position when one has been allotted
router.get('/teams/:competitionId', authenticateToken, [
  param('competitionId').isInt().withMessage('Valid competition ID is required'),
  validate
], async (req, res) => {
  try {
    const [teams] = await pool.execute(
      `SELECT cr.id AS registration_id, cr.team_id, cr.status AS registration_status,
              cr.draw_order, cr.draw_conducted_at, cr.registration_date,
              t.team_name, t.team_code, t.city,
              (SELECT COUNT(*) FROM competition_entries ce
                JOIN players p ON ce.player_id = p.id
                WHERE ce.competition_id = cr.competition_id AND p.team_id = cr.team_id
                  AND ce.status <> 'withdrawn') AS entry_count
       FROM competition_registrations cr
       JOIN teams t ON cr.team_id = t.id
       WHERE cr.competition_id = ? AND cr.status <> 'withdrawn'
       ORDER BY (cr.draw_order IS NULL), cr.draw_order, t.team_name`,
      [req.params.competitionId]
    );

    const drawn = teams.filter((t) => t.draw_order !== null);

    res.json({
      success: true,
      data: {
        teams,
        drawConducted: drawn.length > 0,
        drawnCount: drawn.length,
        conductedAt: drawn[0]?.draw_conducted_at || null
      }
    });
  } catch (error) {
    console.error('Get team draw error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch team draw' });
  }
});

// Allot a random order to every registered team (admin only)
router.post('/teams/conduct', authenticateToken, isAdmin, [
  body('competition_id').isInt().withMessage('Competition ID is required'),
  validate
], async (req, res) => {
  const connection = await pool.getConnection();
  let inTransaction = false;
  try {
    const { competition_id } = req.body;

    const [competitions] = await connection.execute(
      'SELECT id, competition_name FROM competitions WHERE id = ?',
      [competition_id]
    );

    if (competitions.length === 0) {
      return res.status(404).json({ success: false, message: 'Competition not found' });
    }

    const [registrations] = await connection.execute(
      `SELECT cr.id, cr.draw_order, t.team_name
       FROM competition_registrations cr
       JOIN teams t ON cr.team_id = t.id
       WHERE cr.competition_id = ? AND cr.status <> 'withdrawn'`,
      [competition_id]
    );

    if (registrations.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No teams are registered for this competition yet'
      });
    }

    const alreadyDrawn = registrations.filter((r) => r.draw_order !== null).length;
    if (alreadyDrawn > 0 && !req.body.redraw) {
      return res.status(400).json({
        success: false,
        message: 'A draw has already been conducted. Use re-draw to allot a new order.'
      });
    }

    await connection.beginTransaction();
    inTransaction = true;

    // Clear first: unique_competition_draw_order would otherwise collide
    // with the positions still held from a previous draw.
    await connection.execute(
      'UPDATE competition_registrations SET draw_order = NULL WHERE competition_id = ?',
      [competition_id]
    );

    const shuffled = shuffleArray(registrations);
    for (let i = 0; i < shuffled.length; i++) {
      await connection.execute(
        'UPDATE competition_registrations SET draw_order = ?, draw_conducted_at = NOW() WHERE id = ?',
        [i + 1, shuffled[i].id]
      );
    }

    await connection.commit();
    inTransaction = false;

    await logActivity(
      req.user.id, alreadyDrawn > 0 ? 'TEAM_LOTTERY_REDRAWN' : 'TEAM_LOTTERY_CONDUCTED',
      'competitions', competition_id, null,
      { teams: shuffled.length, order: shuffled.map((s, i) => `${i + 1}. ${s.team_name}`) }, req
    );

    const [result] = await pool.execute(
      `SELECT cr.draw_order, t.team_name, t.team_code
       FROM competition_registrations cr
       JOIN teams t ON cr.team_id = t.id
       WHERE cr.competition_id = ? AND cr.draw_order IS NOT NULL
       ORDER BY cr.draw_order`,
      [competition_id]
    );

    res.json({
      success: true,
      message: `Lottery conducted — ${shuffled.length} team${shuffled.length === 1 ? '' : 's'} allotted a random order`,
      data: { teams: result }
    });
  } catch (error) {
    if (inTransaction) await connection.rollback();
    console.error('Conduct team lottery error:', error);
    res.status(500).json({ success: false, message: 'Failed to conduct team lottery' });
  } finally {
    connection.release();
  }
});

// Clear the team draw (admin only)
router.delete('/teams/:competitionId', authenticateToken, isAdmin, [
  param('competitionId').isInt().withMessage('Valid competition ID is required'),
  validate
], async (req, res) => {
  try {
    await pool.execute(
      'UPDATE competition_registrations SET draw_order = NULL, draw_conducted_at = NULL WHERE competition_id = ?',
      [req.params.competitionId]
    );
    await logActivity(req.user.id, 'TEAM_LOTTERY_CLEARED', 'competitions', req.params.competitionId, null, null, req);
    res.json({ success: true, message: 'Team draw cleared' });
  } catch (error) {
    console.error('Clear team draw error:', error);
    res.status(500).json({ success: false, message: 'Failed to clear team draw' });
  }
});

// Get lottery status for a competition
router.get('/competition/:competitionId', authenticateToken, async (req, res) => {
  try {
    const [draws] = await pool.execute(
      `SELECT ld.*, cc.category, ag.group_name as age_group_name, u.full_name as conducted_by_name
       FROM lottery_draws ld
       JOIN competition_categories cc ON ld.competition_category_id = cc.id
       JOIN age_groups ag ON cc.age_group_id = ag.id
       LEFT JOIN users u ON ld.conducted_by = u.id
       WHERE ld.competition_id = ?`,
      [req.params.competitionId]
    );

    res.json({ success: true, data: draws });
  } catch (error) {
    console.error('Get lottery draws error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch lottery draws' });
  }
});

// Get performance sequence for a category
router.get('/sequence/:lotteryDrawId', authenticateToken, async (req, res) => {
  try {
    const [sequences] = await pool.execute(
      `SELECT ps.*, 
              CONCAT(p.first_name, ' ', p.last_name) as player_name,
              p.registration_number,
              t.team_name,
              t.team_code
       FROM performance_sequences ps
       JOIN competition_entries ce ON ps.competition_entry_id = ce.id
       JOIN players p ON ce.player_id = p.id
       JOIN teams t ON p.team_id = t.id
       WHERE ps.lottery_draw_id = ?
       ORDER BY ps.sequence_number`,
      [req.params.lotteryDrawId]
    );

    res.json({ success: true, data: sequences });
  } catch (error) {
    console.error('Get sequence error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch sequence' });
  }
});

// Conduct lottery for a competition category (admin only)
router.post('/conduct', authenticateToken, isAdmin, [
  body('competition_id').isInt().withMessage('Competition ID is required'),
  body('competition_category_id').isInt().withMessage('Category ID is required'),
  validate
], async (req, res) => {
  const connection = await pool.getConnection();
  try {
    const { competition_id, competition_category_id, remarks } = req.body;

    // Check if lottery already conducted
    const [existing] = await connection.execute(
      'SELECT id FROM lottery_draws WHERE competition_id = ? AND competition_category_id = ? AND status = "completed"',
      [competition_id, competition_category_id]
    );

    if (existing.length > 0) {
      return res.status(400).json({ success: false, message: 'Lottery already conducted for this category' });
    }

    // Get all confirmed entries for this category
    const [entries] = await connection.execute(
      `SELECT ce.id as entry_id, ce.player_id, 
              CONCAT(p.first_name, ' ', p.last_name) as player_name,
              t.team_name
       FROM competition_entries ce
       JOIN players p ON ce.player_id = p.id
       JOIN teams t ON p.team_id = t.id
       WHERE ce.competition_id = ? 
         AND ce.competition_category_id = ? 
         AND ce.status = 'confirmed'`,
      [competition_id, competition_category_id]
    );

    if (entries.length === 0) {
      return res.status(400).json({ success: false, message: 'No confirmed entries found for this category' });
    }

    await connection.beginTransaction();

    // Create lottery draw record
    const [drawResult] = await connection.execute(
      `INSERT INTO lottery_draws (competition_id, competition_category_id, status, conducted_by, remarks)
       VALUES (?, ?, 'completed', ?, ?)`,
      [competition_id, competition_category_id, req.user.id, remarks || null]
    );

    const lotteryDrawId = drawResult.insertId;

    // Shuffle entries randomly
    const shuffledEntries = shuffleArray(entries);

    // Create performance sequence
    for (let i = 0; i < shuffledEntries.length; i++) {
      await connection.execute(
        `INSERT INTO performance_sequences (lottery_draw_id, competition_entry_id, sequence_number, performance_status)
         VALUES (?, ?, ?, 'pending')`,
        [lotteryDrawId, shuffledEntries[i].entry_id, i + 1]
      );
    }

    await connection.commit();

    await logActivity(req.user.id, 'LOTTERY_CONDUCTED', 'lottery_draws', lotteryDrawId, null, { 
      competition_id, competition_category_id, entries_count: entries.length 
    }, req);

    // Return the sequence
    const [sequences] = await pool.execute(
      `SELECT ps.*, 
              CONCAT(p.first_name, ' ', p.last_name) as player_name,
              t.team_name
       FROM performance_sequences ps
       JOIN competition_entries ce ON ps.competition_entry_id = ce.id
       JOIN players p ON ce.player_id = p.id
       JOIN teams t ON p.team_id = t.id
       WHERE ps.lottery_draw_id = ?
       ORDER BY ps.sequence_number`,
      [lotteryDrawId]
    );

    res.status(201).json({
      success: true,
      message: `Lottery conducted successfully. ${entries.length} participants assigned random sequence.`,
      data: {
        lotteryDrawId,
        sequences
      }
    });
  } catch (error) {
    await connection.rollback();
    console.error('Conduct lottery error:', error);
    res.status(500).json({ success: false, message: 'Failed to conduct lottery' });
  } finally {
    connection.release();
  }
});

// Re-conduct lottery (cancel previous and create new)
router.post('/reconduct/:lotteryDrawId', authenticateToken, isAdmin, async (req, res) => {
  const connection = await pool.getConnection();
  try {
    const { lotteryDrawId } = req.params;
    const { reason } = req.body;

    // Get existing draw
    const [draws] = await connection.execute(
      'SELECT * FROM lottery_draws WHERE id = ?',
      [lotteryDrawId]
    );

    if (draws.length === 0) {
      return res.status(404).json({ success: false, message: 'Lottery draw not found' });
    }

    // Check if any performances have started
    const [started] = await connection.execute(
      `SELECT id FROM performance_sequences WHERE lottery_draw_id = ? AND performance_status != 'pending'`,
      [lotteryDrawId]
    );

    if (started.length > 0) {
      return res.status(400).json({ success: false, message: 'Cannot re-conduct lottery after performances have started' });
    }

    await connection.beginTransaction();

    // Delete existing sequences
    await connection.execute('DELETE FROM performance_sequences WHERE lottery_draw_id = ?', [lotteryDrawId]);

    // Cancel existing draw
    await connection.execute(
      `UPDATE lottery_draws SET status = 'cancelled', remarks = CONCAT(COALESCE(remarks, ''), ' | Re-conducted: ', ?) WHERE id = ?`,
      [reason || 'Re-draw requested', lotteryDrawId]
    );

    // Get entries and re-shuffle
    const draw = draws[0];
    const [entries] = await connection.execute(
      `SELECT ce.id as entry_id FROM competition_entries ce
       WHERE ce.competition_id = ? AND ce.competition_category_id = ? AND ce.status = 'confirmed'`,
      [draw.competition_id, draw.competition_category_id]
    );

    // Create new draw
    const [newDrawResult] = await connection.execute(
      `INSERT INTO lottery_draws (competition_id, competition_category_id, status, conducted_by, remarks)
       VALUES (?, ?, 'completed', ?, ?)`,
      [draw.competition_id, draw.competition_category_id, req.user.id, `Re-draw from #${lotteryDrawId}: ${reason || ''}`]
    );

    const newLotteryDrawId = newDrawResult.insertId;

    // Shuffle and create new sequences
    const shuffledEntries = shuffleArray(entries);
    for (let i = 0; i < shuffledEntries.length; i++) {
      await connection.execute(
        `INSERT INTO performance_sequences (lottery_draw_id, competition_entry_id, sequence_number, performance_status)
         VALUES (?, ?, ?, 'pending')`,
        [newLotteryDrawId, shuffledEntries[i].entry_id, i + 1]
      );
    }

    await connection.commit();

    await logActivity(req.user.id, 'LOTTERY_RECONDUCTED', 'lottery_draws', newLotteryDrawId, { old_draw_id: lotteryDrawId }, { reason }, req);

    res.json({
      success: true,
      message: 'Lottery re-conducted successfully',
      data: { newLotteryDrawId }
    });
  } catch (error) {
    await connection.rollback();
    console.error('Re-conduct lottery error:', error);
    res.status(500).json({ success: false, message: 'Failed to re-conduct lottery' });
  } finally {
    connection.release();
  }
});

// Update performance status
router.patch('/performance/:sequenceId/status', authenticateToken, [
  param('sequenceId').isInt().withMessage('Valid sequence ID is required'),
  body('status').isIn(['pending', 'performing', 'completed', 'skipped', 'disqualified']).withMessage('Valid status is required'),
  validate
], async (req, res) => {
  try {
    const { status } = req.body;
    const updateFields = ['performance_status = ?'];
    const updateValues = [status];

    if (status === 'performing') {
      updateFields.push('actual_start_time = NOW()');
    } else if (status === 'completed' || status === 'skipped' || status === 'disqualified') {
      updateFields.push('actual_end_time = NOW()');
    }

    await pool.execute(
      `UPDATE performance_sequences SET ${updateFields.join(', ')} WHERE id = ?`,
      [...updateValues, req.params.sequenceId]
    );

    res.json({ success: true, message: 'Performance status updated' });
  } catch (error) {
    console.error('Update performance status error:', error);
    res.status(500).json({ success: false, message: 'Failed to update status' });
  }
});

// Get current performance (who is performing now)
router.get('/current/:competitionId/:categoryId', authenticateToken, async (req, res) => {
  try {
    const [current] = await pool.execute(
      `SELECT ps.*, 
              CONCAT(p.first_name, ' ', p.last_name) as player_name,
              p.registration_number,
              t.team_name
       FROM performance_sequences ps
       JOIN lottery_draws ld ON ps.lottery_draw_id = ld.id
       JOIN competition_entries ce ON ps.competition_entry_id = ce.id
       JOIN players p ON ce.player_id = p.id
       JOIN teams t ON p.team_id = t.id
       WHERE ld.competition_id = ? 
         AND ld.competition_category_id = ?
         AND ps.performance_status = 'performing'
       LIMIT 1`,
      [req.params.competitionId, req.params.categoryId]
    );

    // Get next performer
    const [next] = await pool.execute(
      `SELECT ps.*, 
              CONCAT(p.first_name, ' ', p.last_name) as player_name,
              t.team_name
       FROM performance_sequences ps
       JOIN lottery_draws ld ON ps.lottery_draw_id = ld.id
       JOIN competition_entries ce ON ps.competition_entry_id = ce.id
       JOIN players p ON ce.player_id = p.id
       JOIN teams t ON p.team_id = t.id
       WHERE ld.competition_id = ? 
         AND ld.competition_category_id = ?
         AND ps.performance_status = 'pending'
       ORDER BY ps.sequence_number
       LIMIT 1`,
      [req.params.competitionId, req.params.categoryId]
    );

    res.json({ 
      success: true, 
      data: {
        current: current[0] || null,
        next: next[0] || null
      }
    });
  } catch (error) {
    console.error('Get current performance error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch current performance' });
  }
});

module.exports = router;
