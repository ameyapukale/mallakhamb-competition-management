const express = require('express');
const router = express.Router();
const { body, param } = require('express-validator');
const { pool } = require('../config/database');
const { validate } = require('../middleware/validation.middleware');
const { authenticateToken, isScorer, isJudgeOrScorer, isAdmin } = require('../middleware/auth.middleware');
const { logActivity } = require('../utils/activityLogger');

// Get scoring criteria for a competition
router.get('/criteria/competition/:competitionId', authenticateToken, async (req, res) => {
  try {
    const [criteria] = await pool.execute(
      `SELECT * FROM scoring_criteria 
       WHERE (competition_id = ? OR (competition_id IS NULL AND is_default = TRUE))
         AND is_active = TRUE
       ORDER BY id`,
      [req.params.competitionId]
    );

    res.json({ success: true, data: criteria });
  } catch (error) {
    console.error('Get scoring criteria error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch scoring criteria' });
  }
});

// Create custom scoring criteria for a competition
router.post('/criteria', authenticateToken, isAdmin, [
  body('competition_id').isInt().withMessage('Competition ID is required'),
  body('criteria_name').trim().notEmpty().withMessage('Criteria name is required'),
  body('max_points').isFloat({ min: 0 }).withMessage('Valid max points is required'),
  validate
], async (req, res) => {
  try {
    const { competition_id, criteria_name, description, max_points, weight_percentage, category } = req.body;

    const [result] = await pool.execute(
      `INSERT INTO scoring_criteria (competition_id, criteria_name, description, max_points, weight_percentage, category)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [competition_id, criteria_name, description, max_points, weight_percentage || 100, category || null]
    );

    res.status(201).json({
      success: true,
      message: 'Scoring criteria created successfully',
      data: { criteriaId: result.insertId }
    });
  } catch (error) {
    console.error('Create criteria error:', error);
    res.status(500).json({ success: false, message: 'Failed to create criteria' });
  }
});

// Get scores for a performance
router.get('/performance/:performanceSequenceId', authenticateToken, async (req, res) => {
  try {
    const [scores] = await pool.execute(
      `SELECT s.*, 
              sc.criteria_name, sc.max_points,
              u.full_name as judge_name,
              pm.role as judge_role,
              entered.full_name as entered_by_name
       FROM scores s
       JOIN scoring_criteria sc ON s.scoring_criteria_id = sc.id
       JOIN panel_members pm ON s.panel_member_id = pm.id
       JOIN users u ON pm.judge_id = u.id
       JOIN users entered ON s.entered_by = entered.id
       WHERE s.performance_sequence_id = ?
       ORDER BY pm.id, sc.id`,
      [req.params.performanceSequenceId]
    );

    // Group by judge
    const groupedScores = scores.reduce((acc, score) => {
      const judgeKey = score.panel_member_id;
      if (!acc[judgeKey]) {
        acc[judgeKey] = {
          judge_name: score.judge_name,
          judge_role: score.judge_role,
          scores: []
        };
      }
      acc[judgeKey].scores.push(score);
      return acc;
    }, {});

    res.json({ success: true, data: { scores, groupedScores } });
  } catch (error) {
    console.error('Get scores error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch scores' });
  }
});

// Submit scores (scorer only)
router.post('/submit', authenticateToken, isScorer, [
  body('performance_sequence_id').isInt().withMessage('Performance sequence ID is required'),
  body('panel_member_id').isInt().withMessage('Panel member ID is required'),
  body('scores').isArray({ min: 1 }).withMessage('Scores array is required'),
  validate
], async (req, res) => {
  const connection = await pool.getConnection();
  try {
    const { performance_sequence_id, panel_member_id, scores } = req.body;

    // Verify scorer is assigned to this panel
    const [panelCheck] = await connection.execute(
      `SELECT ps.id FROM panel_scorers ps
       JOIN panel_members pm ON ps.panel_id = pm.panel_id
       WHERE ps.scorer_id = ? AND pm.id = ?`,
      [req.user.id, panel_member_id]
    );

    if (panelCheck.length === 0 && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'You are not authorized to enter scores for this panel' });
    }

    // Verify performance is in progress or just completed
    const [performance] = await connection.execute(
      `SELECT performance_status FROM performance_sequences WHERE id = ?`,
      [performance_sequence_id]
    );

    if (performance.length === 0) {
      return res.status(404).json({ success: false, message: 'Performance not found' });
    }

    if (!['performing', 'completed'].includes(performance[0].performance_status)) {
      return res.status(400).json({ success: false, message: 'Cannot submit scores for this performance status' });
    }

    await connection.beginTransaction();

    for (const score of scores) {
      // Check if score already exists (update) or insert new
      const [existing] = await connection.execute(
        `SELECT id FROM scores 
         WHERE performance_sequence_id = ? AND panel_member_id = ? AND scoring_criteria_id = ?`,
        [performance_sequence_id, panel_member_id, score.scoring_criteria_id]
      );

      if (existing.length > 0) {
        await connection.execute(
          `UPDATE scores SET score = ?, remarks = ?, entered_by = ?, updated_at = NOW()
           WHERE id = ?`,
          [score.score, score.remarks || null, req.user.id, existing[0].id]
        );
      } else {
        await connection.execute(
          `INSERT INTO scores (performance_sequence_id, panel_member_id, scoring_criteria_id, score, remarks, entered_by)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [performance_sequence_id, panel_member_id, score.scoring_criteria_id, score.score, score.remarks || null, req.user.id]
        );
      }
    }

    await connection.commit();

    await logActivity(req.user.id, 'SCORES_SUBMITTED', 'scores', performance_sequence_id, null, { panel_member_id, scores_count: scores.length }, req);

    res.json({ success: true, message: 'Scores submitted successfully' });
  } catch (error) {
    await connection.rollback();
    console.error('Submit scores error:', error);
    res.status(500).json({ success: false, message: 'Failed to submit scores' });
  } finally {
    connection.release();
  }
});

// Bulk submit scores for a judge (all criteria at once)
router.post('/submit-bulk', authenticateToken, isScorer, [
  body('performance_sequence_id').isInt().withMessage('Performance sequence ID is required'),
  body('judge_scores').isArray({ min: 1 }).withMessage('Judge scores array is required'),
  validate
], async (req, res) => {
  const connection = await pool.getConnection();
  try {
    const { performance_sequence_id, judge_scores } = req.body;
    
    // judge_scores = [{ panel_member_id, scores: [{ scoring_criteria_id, score, remarks }] }]

    await connection.beginTransaction();

    for (const judgeScore of judge_scores) {
      for (const score of judgeScore.scores) {
        const [existing] = await connection.execute(
          `SELECT id FROM scores 
           WHERE performance_sequence_id = ? AND panel_member_id = ? AND scoring_criteria_id = ?`,
          [performance_sequence_id, judgeScore.panel_member_id, score.scoring_criteria_id]
        );

        if (existing.length > 0) {
          await connection.execute(
            `UPDATE scores SET score = ?, remarks = ?, entered_by = ?, updated_at = NOW()
             WHERE id = ?`,
            [score.score, score.remarks || null, req.user.id, existing[0].id]
          );
        } else {
          await connection.execute(
            `INSERT INTO scores (performance_sequence_id, panel_member_id, scoring_criteria_id, score, remarks, entered_by)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [performance_sequence_id, judgeScore.panel_member_id, score.scoring_criteria_id, score.score, score.remarks || null, req.user.id]
          );
        }
      }
    }

    await connection.commit();

    await logActivity(req.user.id, 'BULK_SCORES_SUBMITTED', 'scores', performance_sequence_id, null, { judges_count: judge_scores.length }, req);

    res.json({ success: true, message: 'All scores submitted successfully' });
  } catch (error) {
    await connection.rollback();
    console.error('Bulk submit scores error:', error);
    res.status(500).json({ success: false, message: 'Failed to submit scores' });
  } finally {
    connection.release();
  }
});

// Get score entry interface data for a panel
router.get('/entry/:panelId/:performanceSequenceId', authenticateToken, isJudgeOrScorer, async (req, res) => {
  try {
    const { panelId, performanceSequenceId } = req.params;

    // Get panel judges. Only the scoring slots (Judge No. 1-5) — the Scorer and
    // Time Keeper sit on the panel but do not award scores.
    const [judges] = await pool.execute(
      `SELECT pm.id as panel_member_id, pm.position, pm.role, u.full_name
       FROM panel_members pm
       JOIN users u ON pm.judge_id = u.id
       WHERE pm.panel_id = ? AND pm.is_active = TRUE
         AND pm.position IN ('judge_1', 'judge_2', 'judge_3', 'judge_4', 'judge_5')
       ORDER BY pm.position`,
      [panelId]
    );

    // Get scoring criteria
    const [panel] = await pool.execute(
      `SELECT jp.competition_id, cc.category 
       FROM judge_panels jp
       JOIN competition_categories cc ON jp.competition_category_id = cc.id
       WHERE jp.id = ?`,
      [panelId]
    );

    const [criteria] = await pool.execute(
      `SELECT * FROM scoring_criteria 
       WHERE (competition_id = ? OR (competition_id IS NULL AND is_default = TRUE))
         AND (category IS NULL OR category = ?)
         AND is_active = TRUE
       ORDER BY id`,
      [panel[0].competition_id, panel[0].category]
    );

    // Get existing scores
    const [existingScores] = await pool.execute(
      `SELECT panel_member_id, scoring_criteria_id, score, remarks
       FROM scores
       WHERE performance_sequence_id = ?`,
      [performanceSequenceId]
    );

    // Get performance details
    const [performance] = await pool.execute(
      `SELECT ps.*, 
              CONCAT(p.first_name, ' ', p.last_name) as player_name,
              t.team_name
       FROM performance_sequences ps
       JOIN competition_entries ce ON ps.competition_entry_id = ce.id
       JOIN players p ON ce.player_id = p.id
       JOIN teams t ON p.team_id = t.id
       WHERE ps.id = ?`,
      [performanceSequenceId]
    );

    res.json({ 
      success: true, 
      data: { 
        judges, 
        criteria, 
        existingScores,
        performance: performance[0] || null
      } 
    });
  } catch (error) {
    console.error('Get score entry data error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch score entry data' });
  }
});

// Calculate and update final score for an entry
router.post('/calculate-final/:competitionEntryId', authenticateToken, isAdmin, async (req, res) => {
  try {
    const { competitionEntryId } = req.params;

    // Get performance sequence ID
    const [performances] = await pool.execute(
      `SELECT ps.id FROM performance_sequences ps
       JOIN lottery_draws ld ON ps.lottery_draw_id = ld.id
       WHERE ps.competition_entry_id = ?`,
      [competitionEntryId]
    );

    if (performances.length === 0) {
      return res.status(404).json({ success: false, message: 'Performance not found' });
    }

    // Calculate total and average scores
    const [scoreStats] = await pool.execute(
      `SELECT 
        SUM(s.score * sc.weight_percentage / 100) as weighted_total,
        AVG(s.score) as average_score,
        COUNT(DISTINCT s.panel_member_id) as judge_count
       FROM scores s
       JOIN scoring_criteria sc ON s.scoring_criteria_id = sc.id
       WHERE s.performance_sequence_id = ?`,
      [performances[0].id]
    );

    const totalScore = scoreStats[0].weighted_total || 0;
    const averageScore = scoreStats[0].average_score || 0;

    // Upsert final score
    await pool.execute(
      `INSERT INTO final_scores (competition_entry_id, total_score, average_score, calculated_at)
       VALUES (?, ?, ?, NOW())
       ON DUPLICATE KEY UPDATE total_score = ?, average_score = ?, calculated_at = NOW()`,
      [competitionEntryId, totalScore, averageScore, totalScore, averageScore]
    );

    res.json({ 
      success: true, 
      message: 'Final score calculated successfully',
      data: { totalScore, averageScore }
    });
  } catch (error) {
    console.error('Calculate final score error:', error);
    res.status(500).json({ success: false, message: 'Failed to calculate final score' });
  }
});

// Delete score (admin only)
router.delete('/:id', authenticateToken, isAdmin, async (req, res) => {
  try {
    const [score] = await pool.execute('SELECT * FROM scores WHERE id = ?', [req.params.id]);
    
    await pool.execute('DELETE FROM scores WHERE id = ?', [req.params.id]);
    
    await logActivity(req.user.id, 'SCORE_DELETED', 'scores', req.params.id, score[0], null, req);

    res.json({ success: true, message: 'Score deleted successfully' });
  } catch (error) {
    console.error('Delete score error:', error);
    res.status(500).json({ success: false, message: 'Failed to delete score' });
  }
});

module.exports = router;
