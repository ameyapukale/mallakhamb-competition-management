const express = require('express');
const router = express.Router();
const { body, param, query } = require('express-validator');
const { pool } = require('../config/database');
const { validate } = require('../middleware/validation.middleware');
const { authenticateToken, isAdmin, isScorer } = require('../middleware/auth.middleware');
const { logActivity } = require('../utils/activityLogger');
const {
  JUDGE_COLUMNS, JUDGE_FIELDS, MAX_JUDGE_SCORE, SET_TYPES,
  toNumber, calculateTeamPoints, deriveRow
} = require('../utils/scoreSheet');

const SET_TYPE_VALUES = SET_TYPES.map((s) => s.value);

// Header details plus every row, ordered as printed
const fetchSheet = async (sheetId, executor = pool) => {
  const [sheets] = await executor.execute(
    `SELECT ss.*, c.competition_name, c.venue, c.city, c.start_date, c.team_best_count,
            cc.category, cc.age_group_id, TRIM(ag.group_name) AS age_group_name, ag.gender AS age_group_gender,
            ag.min_age AS age_group_min_age, ag.max_age AS age_group_max_age,
            t.team_name, t.team_code,
            jp.panel_name,
            u.full_name AS created_by_name
     FROM score_sheets ss
     JOIN competitions c ON ss.competition_id = c.id
     JOIN competition_categories cc ON ss.competition_category_id = cc.id
     JOIN age_groups ag ON cc.age_group_id = ag.id
     JOIN teams t ON ss.team_id = t.id
     LEFT JOIN judge_panels jp ON ss.panel_id = jp.id
     LEFT JOIN users u ON ss.created_by = u.id
     WHERE ss.id = ?`,
    [sheetId]
  );

  if (sheets.length === 0) return null;

  const [entries] = await executor.execute(
    `SELECT sse.*, p.first_name, p.last_name, p.name_marathi, p.gender, p.registration_number,
            TRIM(CONCAT(p.first_name, ' ', p.last_name)) AS player_name
     FROM score_sheet_entries sse
     JOIN players p ON sse.player_id = p.id
     WHERE sse.score_sheet_id = ?
     ORDER BY sse.row_no`,
    [sheetId]
  );

  return { ...sheets[0], entries, judge_columns: JUDGE_COLUMNS, max_judge_score: MAX_JUDGE_SCORE };
};

// Recompute every derived value on a sheet and persist it
const recalculateSheet = async (sheetId, connection) => {
  const [entries] = await connection.execute(
    'SELECT * FROM score_sheet_entries WHERE score_sheet_id = ?',
    [sheetId]
  );

  const derived = entries.map((e) => ({ id: e.id, ...deriveRow(e) }));

  for (const row of derived) {
    await connection.execute(
      'UPDATE score_sheet_entries SET average_score = ?, final_score = ? WHERE id = ?',
      [row.average_score, row.final_score, row.id]
    );
  }

  const [[competition]] = await connection.execute(
    `SELECT c.team_best_count FROM score_sheets ss
     JOIN competitions c ON ss.competition_id = c.id WHERE ss.id = ?`,
    [sheetId]
  );
  const teamPoints = calculateTeamPoints(derived, competition?.team_best_count);
  await connection.execute(
    'UPDATE score_sheets SET team_points = ? WHERE id = ?',
    [teamPoints, sheetId]
  );

  return teamPoints;
};

// What the scorer can pick from: the competition's categories, and the teams
// that actually have entries in each of them.
router.get('/options/:competitionId', authenticateToken, [
  param('competitionId').isInt().withMessage('Valid competition ID is required'),
  validate
], async (req, res) => {
  try {
    const { competitionId } = req.params;

    const [competitions] = await pool.execute(
      'SELECT id, competition_name, venue, city, start_date, end_date FROM competitions WHERE id = ?',
      [competitionId]
    );

    if (competitions.length === 0) {
      return res.status(404).json({ success: false, message: 'Competition not found' });
    }

    const [categories] = await pool.execute(
      `SELECT cc.id AS competition_category_id, cc.category,
              cc.age_group_id, ag.group_name AS age_group_name,
              (SELECT COUNT(*) FROM competition_entries ce
                WHERE ce.competition_category_id = cc.id) AS entry_count
       FROM competition_categories cc
       JOIN age_groups ag ON cc.age_group_id = ag.id
       WHERE cc.competition_id = ?
       ORDER BY cc.category, ag.min_age`,
      [competitionId]
    );

    // Teams are listed per category, since a team only appears where it has entries
    const [teamRows] = await pool.execute(
      `SELECT DISTINCT ce.competition_category_id, t.id AS team_id, t.team_name, t.team_code,
              COUNT(*) OVER (PARTITION BY ce.competition_category_id, t.id) AS player_count
       FROM competition_entries ce
       JOIN players p ON ce.player_id = p.id
       JOIN teams t ON p.team_id = t.id
       WHERE ce.competition_id = ?
       ORDER BY t.team_name`,
      [competitionId]
    );

    const [existing] = await pool.execute(
      `SELECT id, competition_category_id, team_id, set_type, status, team_points
       FROM score_sheets WHERE competition_id = ?`,
      [competitionId]
    );

    res.json({
      success: true,
      data: {
        competition: competitions[0],
        categories: categories.map((c) => ({
          ...c,
          teams: teamRows
            .filter((t) => t.competition_category_id === c.competition_category_id)
            .map((t) => ({ team_id: t.team_id, team_name: t.team_name, team_code: t.team_code, player_count: t.player_count }))
        })),
        setTypes: SET_TYPES,
        existingSheets: existing
      }
    });
  } catch (error) {
    console.error('Score sheet options error:', error);
    res.status(500).json({ success: false, message: 'Failed to load score sheet options' });
  }
});

// All sheets for a competition, for an overview list
router.get('/competition/:competitionId', authenticateToken, [
  param('competitionId').isInt().withMessage('Valid competition ID is required'),
  validate
], async (req, res) => {
  try {
    const [sheets] = await pool.execute(
      `SELECT ss.id, ss.set_type, ss.event_number, ss.status, ss.team_points, ss.updated_at,
              cc.category, ag.group_name AS age_group_name, t.team_name,
              (SELECT COUNT(*) FROM score_sheet_entries sse WHERE sse.score_sheet_id = ss.id) AS player_count,
              (SELECT COUNT(*) FROM score_sheet_entries sse
                WHERE sse.score_sheet_id = ss.id AND sse.final_score IS NOT NULL) AS scored_count
       FROM score_sheets ss
       JOIN competition_categories cc ON ss.competition_category_id = cc.id
       JOIN age_groups ag ON cc.age_group_id = ag.id
       JOIN teams t ON ss.team_id = t.id
       WHERE ss.competition_id = ?
       ORDER BY cc.category, ag.min_age, t.team_name`,
      [req.params.competitionId]
    );

    res.json({ success: true, data: sheets });
  } catch (error) {
    console.error('List score sheets error:', error);
    res.status(500).json({ success: false, message: 'Failed to list score sheets' });
  }
});

// Open the sheet for a team + category + set, creating it (with its player rows)
// on first use. Rows come from the competition entries for that category.
router.post('/open', authenticateToken, isScorer, [
  body('competition_id').isInt().withMessage('Competition is required'),
  body('competition_category_id').isInt().withMessage('Category is required'),
  body('team_id').isInt().withMessage('Team is required'),
  body('set_type').optional().isIn(SET_TYPE_VALUES).withMessage('Valid set type is required'),
  validate
], async (req, res) => {
  const connection = await pool.getConnection();
  let inTransaction = false;
  try {
    const { competition_id, competition_category_id, team_id } = req.body;
    const set_type = req.body.set_type || 'compulsory';

    const [categories] = await connection.execute(
      'SELECT id FROM competition_categories WHERE id = ? AND competition_id = ?',
      [competition_category_id, competition_id]
    );

    if (categories.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'That category does not belong to the selected competition'
      });
    }

    const [existing] = await connection.execute(
      `SELECT id FROM score_sheets
       WHERE competition_id = ? AND competition_category_id = ? AND team_id = ? AND set_type = ?`,
      [competition_id, competition_category_id, team_id, set_type]
    );

    let sheetId = existing[0]?.id;

    await connection.beginTransaction();
    inTransaction = true;

    if (!sheetId) {
      const [created] = await connection.execute(
        `INSERT INTO score_sheets
           (competition_id, competition_category_id, team_id, set_type, created_by)
         VALUES (?, ?, ?, ?, ?)`,
        [competition_id, competition_category_id, team_id, set_type, req.user.id]
      );
      sheetId = created.insertId;
    }

    // Players entered in this competition category who belong to this team.
    // Re-run on every open so entries added later show up on an existing sheet.
    const [entered] = await connection.execute(
      `SELECT ce.id AS competition_entry_id, ce.player_id
       FROM competition_entries ce
       JOIN players p ON ce.player_id = p.id
       WHERE ce.competition_id = ? AND ce.competition_category_id = ?
         AND p.team_id = ? AND ce.status <> 'withdrawn'
       ORDER BY p.first_name, p.last_name`,
      [competition_id, competition_category_id, team_id]
    );

    const [currentRows] = await connection.execute(
      'SELECT player_id, row_no FROM score_sheet_entries WHERE score_sheet_id = ?',
      [sheetId]
    );
    const havePlayer = new Set(currentRows.map((r) => r.player_id));
    let nextRow = currentRows.reduce((max, r) => Math.max(max, r.row_no), 0) + 1;

    let added = 0;
    for (const entry of entered) {
      if (havePlayer.has(entry.player_id)) continue;
      await connection.execute(
        `INSERT INTO score_sheet_entries
           (score_sheet_id, player_id, competition_entry_id, row_no)
         VALUES (?, ?, ?, ?)`,
        [sheetId, entry.player_id, entry.competition_entry_id, nextRow++]
      );
      added++;
    }

    await connection.commit();
    inTransaction = false;

    const sheet = await fetchSheet(sheetId);

    res.json({
      success: true,
      message: existing.length ? 'Score sheet opened' : 'Score sheet created',
      data: { ...sheet, rows_added: added }
    });
  } catch (error) {
    if (inTransaction) await connection.rollback();
    console.error('Open score sheet error:', error);
    res.status(500).json({ success: false, message: 'Failed to open score sheet' });
  } finally {
    connection.release();
  }
});

// Get one sheet
router.get('/:id', authenticateToken, [
  param('id').isInt().withMessage('Valid sheet ID is required'),
  validate
], async (req, res) => {
  try {
    const sheet = await fetchSheet(req.params.id);
    if (!sheet) {
      return res.status(404).json({ success: false, message: 'Score sheet not found' });
    }
    res.json({ success: true, data: sheet });
  } catch (error) {
    console.error('Get score sheet error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch score sheet' });
  }
});

// Save the sheet: header fields and every row in one go, then recompute
router.put('/:id', authenticateToken, isScorer, [
  param('id').isInt().withMessage('Valid sheet ID is required'),
  body('entries').optional().isArray().withMessage('Entries must be an array'),
  body('event_number').optional({ nullable: true }).trim().isLength({ max: 20 }),
  body('set_type').optional().isIn(SET_TYPE_VALUES),
  body('panel_id').optional({ nullable: true }).isInt(),
  validate
], async (req, res) => {
  const connection = await pool.getConnection();
  let inTransaction = false;
  try {
    const sheetId = req.params.id;
    const { entries = [], event_number, panel_id, remarks, set_type } = req.body;

    const [sheets] = await connection.execute(
      'SELECT id, status FROM score_sheets WHERE id = ?',
      [sheetId]
    );

    if (sheets.length === 0) {
      return res.status(404).json({ success: false, message: 'Score sheet not found' });
    }

    if (sheets[0].status === 'submitted' && req.user.role !== 'admin') {
      return res.status(400).json({
        success: false,
        message: 'This sheet has been submitted. Ask an admin to reopen it before editing.'
      });
    }

    // Rows must belong to this sheet
    const [ownRows] = await connection.execute(
      'SELECT id FROM score_sheet_entries WHERE score_sheet_id = ?',
      [sheetId]
    );
    const ownIds = new Set(ownRows.map((r) => r.id));

    for (const entry of entries) {
      if (!ownIds.has(Number(entry.id))) {
        return res.status(400).json({
          success: false,
          message: 'One of the rows does not belong to this score sheet'
        });
      }

      for (const field of JUDGE_FIELDS) {
        const value = toNumber(entry[field]);
        if (value !== null && (value < 0 || value > MAX_JUDGE_SCORE)) {
          return res.status(400).json({
            success: false,
            message: `Judge scores must be between 0 and ${MAX_JUDGE_SCORE}`
          });
        }
      }

      const deduction = toNumber(entry.deduction);
      if (deduction !== null && deduction < 0) {
        return res.status(400).json({ success: false, message: 'गुण कपात cannot be negative' });
      }
    }

    await connection.beginTransaction();
    inTransaction = true;

    for (const entry of entries) {
      await connection.execute(
        `UPDATE score_sheet_entries SET
           performance_time = ?, head_judge_score = ?, judge1_score = ?, judge2_score = ?,
           judge3_score = ?, judge4_score = ?, deduction = ?
         WHERE id = ? AND score_sheet_id = ?`,
        [
          entry.performance_time?.trim() || null,
          toNumber(entry.head_judge_score),
          toNumber(entry.judge1_score),
          toNumber(entry.judge2_score),
          toNumber(entry.judge3_score),
          toNumber(entry.judge4_score),
          toNumber(entry.deduction) ?? 0,
          entry.id,
          sheetId
        ]
      );
    }

    await connection.execute(
      `UPDATE score_sheets SET
         event_number = COALESCE(?, event_number),
         panel_id = COALESCE(?, panel_id),
         remarks = COALESCE(?, remarks),
         set_type = COALESCE(?, set_type)
       WHERE id = ?`,
      [
        event_number ?? null,
        panel_id ?? null,
        remarks ?? null,
        set_type ?? null,
        sheetId
      ]
    );

    const teamPoints = await recalculateSheet(sheetId, connection);

    await connection.commit();
    inTransaction = false;

    await logActivity(
      req.user.id, 'SCORE_SHEET_SAVED', 'score_sheets', sheetId, null,
      { rows: entries.length, team_points: teamPoints }, req
    );

    const sheet = await fetchSheet(sheetId);
    res.json({ success: true, message: 'Score sheet saved', data: sheet });
  } catch (error) {
    if (inTransaction) await connection.rollback();
    console.error('Save score sheet error:', error);
    res.status(500).json({ success: false, message: 'Failed to save score sheet' });
  } finally {
    connection.release();
  }
});

// Submit / reopen
router.patch('/:id/status', authenticateToken, isScorer, [
  param('id').isInt().withMessage('Valid sheet ID is required'),
  body('status').isIn(['draft', 'submitted']).withMessage('Valid status is required'),
  validate
], async (req, res) => {
  try {
    const { status } = req.body;

    if (status === 'draft' && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Only an admin can reopen a submitted sheet'
      });
    }

    const [result] = await pool.execute(
      `UPDATE score_sheets
       SET status = ?,
           submitted_by = ${status === 'submitted' ? '?' : 'NULL'},
           submitted_at = ${status === 'submitted' ? 'NOW()' : 'NULL'}
       WHERE id = ?`,
      status === 'submitted' ? [status, req.user.id, req.params.id] : [status, req.params.id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: 'Score sheet not found' });
    }

    await logActivity(
      req.user.id, status === 'submitted' ? 'SCORE_SHEET_SUBMITTED' : 'SCORE_SHEET_REOPENED',
      'score_sheets', req.params.id, null, { status }, req
    );

    res.json({ success: true, message: status === 'submitted' ? 'Score sheet submitted' : 'Score sheet reopened' });
  } catch (error) {
    console.error('Score sheet status error:', error);
    res.status(500).json({ success: false, message: 'Failed to update score sheet' });
  }
});

// Delete a sheet (admin only)
router.delete('/:id', authenticateToken, isAdmin, [
  param('id').isInt().withMessage('Valid sheet ID is required'),
  validate
], async (req, res) => {
  try {
    const [result] = await pool.execute('DELETE FROM score_sheets WHERE id = ?', [req.params.id]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: 'Score sheet not found' });
    }
    await logActivity(req.user.id, 'SCORE_SHEET_DELETED', 'score_sheets', req.params.id, null, null, req);
    res.json({ success: true, message: 'Score sheet deleted' });
  } catch (error) {
    console.error('Delete score sheet error:', error);
    res.status(500).json({ success: false, message: 'Failed to delete score sheet' });
  }
});

module.exports = router;
