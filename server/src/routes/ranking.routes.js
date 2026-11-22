const express = require('express');
const router = express.Router();
const { param } = require('express-validator');
const { pool } = require('../config/database');
const { validate } = require('../middleware/validation.middleware');
const { authenticateToken, isAdmin } = require('../middleware/auth.middleware');
const { logActivity } = require('../utils/activityLogger');

// Get rankings for a competition category
router.get('/competition/:competitionId/category/:categoryId', authenticateToken, async (req, res) => {
  try {
    const [rankings] = await pool.execute(
      `SELECT 
        fs.*,
        ce.entry_number,
        CONCAT(p.first_name, ' ', p.last_name) as player_name,
        p.registration_number,
        t.team_name,
        t.team_code,
        ag.group_name as age_group_name,
        cc.category
       FROM final_scores fs
       JOIN competition_entries ce ON fs.competition_entry_id = ce.id
       JOIN competition_categories cc ON ce.competition_category_id = cc.id
       JOIN age_groups ag ON cc.age_group_id = ag.id
       JOIN players p ON ce.player_id = p.id
       JOIN teams t ON p.team_id = t.id
       WHERE ce.competition_id = ? AND ce.competition_category_id = ?
         AND fs.is_disqualified = FALSE
       ORDER BY fs.total_score DESC, fs.average_score DESC`,
      [req.params.competitionId, req.params.categoryId]
    );

    res.json({ success: true, data: rankings });
  } catch (error) {
    console.error('Get rankings error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch rankings' });
  }
});

// Get all rankings for a competition (all categories)
router.get('/competition/:competitionId', authenticateToken, async (req, res) => {
  try {
    // Get all categories for this competition
    const [categories] = await pool.execute(
      `SELECT cc.id, cc.category, ag.group_name as age_group_name
       FROM competition_categories cc
       JOIN age_groups ag ON cc.age_group_id = ag.id
       WHERE cc.competition_id = ?`,
      [req.params.competitionId]
    );

    const results = {};
    
    for (const category of categories) {
      const [rankings] = await pool.execute(
        `SELECT 
          fs.*,
          CONCAT(p.first_name, ' ', p.last_name) as player_name,
          p.registration_number,
          t.team_name
         FROM final_scores fs
         JOIN competition_entries ce ON fs.competition_entry_id = ce.id
         JOIN players p ON ce.player_id = p.id
         JOIN teams t ON p.team_id = t.id
         WHERE ce.competition_id = ? AND ce.competition_category_id = ?
           AND fs.is_disqualified = FALSE
         ORDER BY fs.total_score DESC, fs.average_score DESC`,
        [req.params.competitionId, category.id]
      );

      const key = `${category.category}_${category.age_group_name}`;
      results[key] = {
        category: category.category,
        age_group: category.age_group_name,
        rankings
      };
    }

    res.json({ success: true, data: results });
  } catch (error) {
    console.error('Get all rankings error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch rankings' });
  }
});

// Calculate and assign ranks for a category
router.post('/calculate/:competitionId/:categoryId', authenticateToken, isAdmin, async (req, res) => {
  const connection = await pool.getConnection();
  try {
    const { competitionId, categoryId } = req.params;

    await connection.beginTransaction();

    // First calculate all final scores
    const [entries] = await connection.execute(
      `SELECT ce.id as entry_id, ps.id as performance_id
       FROM competition_entries ce
       JOIN performance_sequences ps ON ps.competition_entry_id = ce.id
       JOIN lottery_draws ld ON ps.lottery_draw_id = ld.id
       WHERE ce.competition_id = ? AND ce.competition_category_id = ?
         AND ps.performance_status = 'completed'`,
      [competitionId, categoryId]
    );

    for (const entry of entries) {
      // Calculate total and average scores for each entry
      const [scoreStats] = await connection.execute(
        `SELECT 
          SUM(s.score * sc.weight_percentage / 100) as weighted_total,
          AVG(s.score) as average_score
         FROM scores s
         JOIN scoring_criteria sc ON s.scoring_criteria_id = sc.id
         WHERE s.performance_sequence_id = ?`,
        [entry.performance_id]
      );

      const totalScore = scoreStats[0].weighted_total || 0;
      const averageScore = scoreStats[0].average_score || 0;

      // Upsert final score
      await connection.execute(
        `INSERT INTO final_scores (competition_entry_id, total_score, average_score, calculated_at)
         VALUES (?, ?, ?, NOW())
         ON DUPLICATE KEY UPDATE total_score = ?, average_score = ?, calculated_at = NOW()`,
        [entry.entry_id, totalScore, averageScore, totalScore, averageScore]
      );
    }

    // Now assign ranks
    const [rankings] = await connection.execute(
      `SELECT fs.id, fs.competition_entry_id, fs.total_score
       FROM final_scores fs
       JOIN competition_entries ce ON fs.competition_entry_id = ce.id
       WHERE ce.competition_id = ? AND ce.competition_category_id = ?
         AND fs.is_disqualified = FALSE
       ORDER BY fs.total_score DESC, fs.average_score DESC`,
      [competitionId, categoryId]
    );

    let currentRank = 1;
    for (let i = 0; i < rankings.length; i++) {
      // Determine rank status
      let rankStatus = 'participant';
      if (currentRank === 1) rankStatus = 'gold';
      else if (currentRank === 2) rankStatus = 'silver';
      else if (currentRank === 3) rankStatus = 'bronze';

      await connection.execute(
        `UPDATE final_scores SET rank_position = ?, rank_status = ? WHERE id = ?`,
        [currentRank, rankStatus, rankings[i].id]
      );

      currentRank++;
    }

    await connection.commit();

    await logActivity(req.user.id, 'RANKINGS_CALCULATED', 'final_scores', categoryId, null, { 
      competition_id: competitionId, 
      entries_ranked: rankings.length 
    }, req);

    res.json({ 
      success: true, 
      message: `Rankings calculated for ${rankings.length} entries`,
      data: { entriesRanked: rankings.length }
    });
  } catch (error) {
    await connection.rollback();
    console.error('Calculate rankings error:', error);
    res.status(500).json({ success: false, message: 'Failed to calculate rankings' });
  } finally {
    connection.release();
  }
});

// Disqualify an entry
router.patch('/disqualify/:competitionEntryId', authenticateToken, isAdmin, [
  param('competitionEntryId').isInt().withMessage('Valid entry ID is required'),
  validate
], async (req, res) => {
  try {
    const { reason } = req.body;

    await pool.execute(
      `UPDATE final_scores 
       SET is_disqualified = TRUE, disqualification_reason = ?, rank_position = NULL, rank_status = 'participant'
       WHERE competition_entry_id = ?`,
      [reason || 'Disqualified by admin', req.params.competitionEntryId]
    );

    await pool.execute(
      `UPDATE competition_entries SET status = 'disqualified' WHERE id = ?`,
      [req.params.competitionEntryId]
    );

    await logActivity(req.user.id, 'ENTRY_DISQUALIFIED', 'final_scores', req.params.competitionEntryId, null, { reason }, req);

    res.json({ success: true, message: 'Entry disqualified successfully' });
  } catch (error) {
    console.error('Disqualify entry error:', error);
    res.status(500).json({ success: false, message: 'Failed to disqualify entry' });
  }
});

// Get team rankings (total points across all categories)
router.get('/teams/:competitionId', authenticateToken, async (req, res) => {
  try {
    const [teamRankings] = await pool.execute(
      `SELECT 
        t.id as team_id,
        t.team_name,
        t.team_code,
        SUM(fs.total_score) as total_team_score,
        COUNT(CASE WHEN fs.rank_status = 'gold' THEN 1 END) as gold_count,
        COUNT(CASE WHEN fs.rank_status = 'silver' THEN 1 END) as silver_count,
        COUNT(CASE WHEN fs.rank_status = 'bronze' THEN 1 END) as bronze_count,
        COUNT(fs.id) as total_participants
       FROM final_scores fs
       JOIN competition_entries ce ON fs.competition_entry_id = ce.id
       JOIN players p ON ce.player_id = p.id
       JOIN teams t ON p.team_id = t.id
       WHERE ce.competition_id = ? AND fs.is_disqualified = FALSE
       GROUP BY t.id, t.team_name, t.team_code
       ORDER BY gold_count DESC, silver_count DESC, bronze_count DESC, total_team_score DESC`,
      [req.params.competitionId]
    );

    res.json({ success: true, data: teamRankings });
  } catch (error) {
    console.error('Get team rankings error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch team rankings' });
  }
});

// Get winners summary
router.get('/winners/:competitionId', authenticateToken, async (req, res) => {
  try {
    const [winners] = await pool.execute(
      `SELECT 
        fs.rank_status,
        fs.total_score,
        CONCAT(p.first_name, ' ', p.last_name) as player_name,
        t.team_name,
        cc.category,
        ag.group_name as age_group_name
       FROM final_scores fs
       JOIN competition_entries ce ON fs.competition_entry_id = ce.id
       JOIN competition_categories cc ON ce.competition_category_id = cc.id
       JOIN age_groups ag ON cc.age_group_id = ag.id
       JOIN players p ON ce.player_id = p.id
       JOIN teams t ON p.team_id = t.id
       WHERE ce.competition_id = ? 
         AND fs.rank_status IN ('gold', 'silver', 'bronze')
         AND fs.is_disqualified = FALSE
       ORDER BY cc.id, fs.rank_position`,
      [req.params.competitionId]
    );

    // Group by category
    const grouped = winners.reduce((acc, winner) => {
      const key = `${winner.category}_${winner.age_group_name}`;
      if (!acc[key]) {
        acc[key] = {
          category: winner.category,
          age_group: winner.age_group_name,
          winners: []
        };
      }
      acc[key].winners.push(winner);
      return acc;
    }, {});

    res.json({ success: true, data: grouped });
  } catch (error) {
    console.error('Get winners error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch winners' });
  }
});

// Export rankings as JSON (for certificates, etc.)
router.get('/export/:competitionId', authenticateToken, async (req, res) => {
  try {
    const [competition] = await pool.execute(
      'SELECT * FROM competitions WHERE id = ?',
      [req.params.competitionId]
    );

    const [allRankings] = await pool.execute(
      `SELECT 
        fs.rank_position,
        fs.rank_status,
        fs.total_score,
        fs.average_score,
        CONCAT(p.first_name, ' ', p.last_name) as player_name,
        p.registration_number,
        t.team_name,
        t.team_code,
        cc.category,
        ag.group_name as age_group_name
       FROM final_scores fs
       JOIN competition_entries ce ON fs.competition_entry_id = ce.id
       JOIN competition_categories cc ON ce.competition_category_id = cc.id
       JOIN age_groups ag ON cc.age_group_id = ag.id
       JOIN players p ON ce.player_id = p.id
       JOIN teams t ON p.team_id = t.id
       WHERE ce.competition_id = ? AND fs.is_disqualified = FALSE
       ORDER BY cc.id, fs.rank_position`,
      [req.params.competitionId]
    );

    res.json({
      success: true,
      data: {
        competition: competition[0],
        rankings: allRankings,
        exported_at: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Export rankings error:', error);
    res.status(500).json({ success: false, message: 'Failed to export rankings' });
  }
});

module.exports = router;
