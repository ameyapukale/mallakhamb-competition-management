const express = require('express');
const router = express.Router();
const { body, param } = require('express-validator');
const { pool } = require('../config/database');
const { validate } = require('../middleware/validation.middleware');
const { authenticateToken, isAdmin, isJudgeOrScorer } = require('../middleware/auth.middleware');
const { logActivity } = require('../utils/activityLogger');
const {
  ACTIVE_COMPETITION_STATUSES,
  PANEL_POSITIONS,
  PANEL_POSITION_VALUES,
  POSITION_LABELS,
  FREE_TEXT_POSITIONS,
  activeStatusPlaceholders
} = require('../utils/panelPositions');

const MAX_MEMBER_NAME = 100;

// An assignment value may be a judge id (number or numeric string) or an object
// carrying either { judge_id } or { name }. Returns null for a blank slot, or
// { error } when the value cannot be interpreted.
const normaliseAssignment = (position, raw) => {
  if (raw === null || raw === undefined || raw === '') return null;

  const asName = (name) => {
    const trimmed = String(name).trim();
    if (!trimmed) return null;
    if (!FREE_TEXT_POSITIONS.includes(position)) {
      return { error: `${POSITION_LABELS[position]} must be a registered judge, not a typed name` };
    }
    if (trimmed.length > MAX_MEMBER_NAME) {
      return { error: `Name for ${POSITION_LABELS[position]} is too long` };
    }
    return { position, memberName: trimmed };
  };

  if (typeof raw === 'object') {
    if (raw.name !== undefined && raw.name !== null && String(raw.name).trim() !== '') return asName(raw.name);
    if (raw.judge_id === undefined || raw.judge_id === null || raw.judge_id === '') return null;
    const id = parseInt(raw.judge_id, 10);
    if (Number.isNaN(id)) return { error: `Invalid judge for ${POSITION_LABELS[position]}` };
    return { position, judgeId: id };
  }

  // A bare non-numeric string is treated as a typed-in name
  if (typeof raw === 'string' && !/^\d+$/.test(raw.trim())) return asName(raw);

  const id = parseInt(raw, 10);
  if (Number.isNaN(id)) return { error: `Invalid judge for ${POSITION_LABELS[position]}` };
  return { position, judgeId: id };
};

// Members of a panel, ordered by slot rather than by name
const POSITION_ORDER_SQL = `FIELD(pm.position, ${PANEL_POSITION_VALUES.map(() => '?').join(', ')})`;

const fetchPanelMembers = async (panelId) => {
  // LEFT JOIN: members entered as free text have no users row
  const [members] = await pool.execute(
    `SELECT pm.id, pm.panel_id, pm.judge_id, pm.member_name, pm.position, pm.is_active,
            u.full_name, u.username, u.email, u.phone, u.role AS account_role
     FROM panel_members pm
     LEFT JOIN users u ON pm.judge_id = u.id
     WHERE pm.panel_id = ? AND pm.is_active = TRUE
     ORDER BY ${POSITION_ORDER_SQL}`,
    [panelId, ...PANEL_POSITION_VALUES]
  );

  return members.map((m) => ({
    ...m,
    position_label: POSITION_LABELS[m.position],
    // One field the client can always render, whichever way the slot was filled
    display_name: m.judge_id ? m.full_name : m.member_name,
    is_external: !m.judge_id
  }));
};

// The seven slot definitions, so the client never hard-codes them
router.get('/positions', authenticateToken, (req, res) => {
  res.json({ success: true, data: PANEL_POSITIONS });
});

// Everything the Create Panel form needs for one competition:
// the categories/age groups actually selected in it, plus its registered judges.
router.get('/form-data/:competitionId', authenticateToken, isAdmin, [
  param('competitionId').isInt().withMessage('Valid competition ID is required'),
  validate
], async (req, res) => {
  try {
    const { competitionId } = req.params;

    const [competitions] = await pool.execute(
      'SELECT id, competition_name, status FROM competitions WHERE id = ? AND is_active = TRUE',
      [competitionId]
    );

    if (competitions.length === 0) {
      return res.status(404).json({ success: false, message: 'Competition not found' });
    }

    // Only the category + age group combinations selected in this competition
    const [categories] = await pool.execute(
      `SELECT cc.id AS competition_category_id, cc.category,
              cc.age_group_id, ag.group_name AS age_group_name,
              ag.min_age, ag.max_age,
              (SELECT COUNT(*) FROM judge_panels jp
                WHERE jp.competition_category_id = cc.id AND jp.is_active = TRUE) AS panel_count
       FROM competition_categories cc
       JOIN age_groups ag ON cc.age_group_id = ag.id
       WHERE cc.competition_id = ?
       ORDER BY cc.category, ag.min_age`,
      [competitionId]
    );

    // Only judges who registered themselves for this competition
    const [judges] = await pool.execute(
      `SELECT cj.judge_id, u.full_name, u.username, u.email, u.role AS account_role,
              cj.registered_at
       FROM competition_judges cj
       JOIN users u ON cj.judge_id = u.id
       WHERE cj.competition_id = ? AND cj.status = 'registered' AND u.is_active = TRUE
       ORDER BY u.full_name`,
      [competitionId]
    );

    res.json({
      success: true,
      data: {
        competition: competitions[0],
        categories,
        judges,
        positions: PANEL_POSITIONS
      }
    });
  } catch (error) {
    console.error('Get panel form data error:', error);
    res.status(500).json({ success: false, message: 'Failed to load panel form data' });
  }
});

// Get all panels for a competition
router.get('/competition/:competitionId', authenticateToken, async (req, res) => {
  try {
    const [panels] = await pool.execute(
      `SELECT jp.*, cc.category, cc.age_group_id, ag.group_name as age_group_name,
              c.competition_name, c.status AS competition_status
       FROM judge_panels jp
       JOIN competition_categories cc ON jp.competition_category_id = cc.id
       JOIN age_groups ag ON cc.age_group_id = ag.id
       JOIN competitions c ON jp.competition_id = c.id
       WHERE jp.competition_id = ? AND jp.is_active = TRUE
       ORDER BY cc.category, ag.min_age`,
      [req.params.competitionId]
    );

    for (const panel of panels) {
      panel.members = await fetchPanelMembers(panel.id);
    }

    res.json({ success: true, data: panels });
  } catch (error) {
    console.error('Get panels error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch panels' });
  }
});

// Panels for every active competition.
// Judges see all of them, not only the ones they sit on; my_position marks their own slot.
router.get('/my/panels', authenticateToken, isJudgeOrScorer, async (req, res) => {
  try {
    const [panels] = await pool.execute(
      `SELECT jp.*, cc.category, ag.group_name as age_group_name,
              c.competition_name, c.status AS competition_status,
              mine.position AS my_position
       FROM judge_panels jp
       JOIN competition_categories cc ON jp.competition_category_id = cc.id
       JOIN age_groups ag ON cc.age_group_id = ag.id
       JOIN competitions c ON jp.competition_id = c.id
       LEFT JOIN panel_members mine
              ON mine.panel_id = jp.id AND mine.judge_id = ? AND mine.is_active = TRUE
       WHERE jp.is_active = TRUE AND c.is_active = TRUE
         AND c.status IN (${activeStatusPlaceholders})
       ORDER BY c.start_date, cc.category, ag.min_age`,
      [req.user.id, ...ACTIVE_COMPETITION_STATUSES]
    );

    for (const panel of panels) {
      panel.members = await fetchPanelMembers(panel.id);
      panel.my_position_label = panel.my_position ? POSITION_LABELS[panel.my_position] : null;
    }

    res.json({ success: true, data: panels });
  } catch (error) {
    console.error('Get my panels error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch panels' });
  }
});

// Get panel by ID
router.get('/:id', authenticateToken, [
  param('id').isInt().withMessage('Valid panel ID is required'),
  validate
], async (req, res) => {
  try {
    const [panels] = await pool.execute(
      `SELECT jp.*, cc.category, cc.age_group_id, ag.group_name as age_group_name,
              c.competition_name, c.status AS competition_status
       FROM judge_panels jp
       JOIN competition_categories cc ON jp.competition_category_id = cc.id
       JOIN age_groups ag ON cc.age_group_id = ag.id
       JOIN competitions c ON jp.competition_id = c.id
       WHERE jp.id = ?`,
      [req.params.id]
    );

    if (panels.length === 0) {
      return res.status(404).json({ success: false, message: 'Panel not found' });
    }

    const members = await fetchPanelMembers(req.params.id);
    const mine = members.find((m) => m.judge_id === req.user.id);

    res.json({
      success: true,
      data: {
        ...panels[0],
        members,
        positions: PANEL_POSITIONS,
        my_position: mine?.position || null,
        my_position_label: mine ? POSITION_LABELS[mine.position] : null
      }
    });
  } catch (error) {
    console.error('Get panel error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch panel' });
  }
});

// Create judge panel with its position assignments (admin only)
router.post('/', authenticateToken, isAdmin, [
  body('competition_id').isInt().withMessage('Competition ID is required'),
  body('competition_category_id').isInt().withMessage('Category is required'),
  body('panel_name').trim().notEmpty().withMessage('Panel name is required'),
  body('assignments').optional().isObject().withMessage('Assignments must be an object'),
  validate
], async (req, res) => {
  const connection = await pool.getConnection();
  let inTransaction = false;
  try {
    const {
      competition_id, competition_category_id, panel_name, panel_code,
      assignments = {}
    } = req.body;

    // The category must belong to this competition
    const [categories] = await connection.execute(
      `SELECT cc.id, cc.category, ag.group_name AS age_group_name
       FROM competition_categories cc
       JOIN age_groups ag ON cc.age_group_id = ag.id
       WHERE cc.id = ? AND cc.competition_id = ?`,
      [competition_category_id, competition_id]
    );

    if (categories.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'That category does not belong to the selected competition'
      });
    }

    // Reject unknown slot names before touching the database
    const unknownPositions = Object.keys(assignments)
      .filter((p) => !PANEL_POSITION_VALUES.includes(p));
    if (unknownPositions.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Unknown position: ${unknownPositions.join(', ')}`
      });
    }

    // Drop blank slots, then normalise each to an account or a typed-in name
    const entries = [];
    for (const [position, raw] of Object.entries(assignments)) {
      const parsed = normaliseAssignment(position, raw);
      if (!parsed) continue;
      if (parsed.error) return res.status(400).json({ success: false, message: parsed.error });
      entries.push(parsed);
    }

    // One person cannot hold two slots on the same panel
    const judgeIds = entries.filter((e) => e.judgeId).map((e) => e.judgeId);
    const duplicates = judgeIds.filter((id, i) => judgeIds.indexOf(id) !== i);
    if (duplicates.length > 0) {
      const clashing = entries
        .filter((e) => duplicates.includes(e.judgeId))
        .map((e) => POSITION_LABELS[e.position]);
      return res.status(400).json({
        success: false,
        message: `The same person cannot fill more than one slot (${clashing.join(' and ')})`
      });
    }

    // Same check for typed-in names, which no unique key can cover
    const names = entries.filter((e) => e.memberName).map((e) => e.memberName.toLowerCase());
    const dupNames = names.filter((n, i) => names.indexOf(n) !== i);
    if (dupNames.length > 0) {
      const clashing = entries
        .filter((e) => e.memberName && dupNames.includes(e.memberName.toLowerCase()))
        .map((e) => POSITION_LABELS[e.position]);
      return res.status(400).json({
        success: false,
        message: `The same name cannot fill more than one slot (${clashing.join(' and ')})`
      });
    }

    // Every assignee must be a judge registered for this competition
    if (judgeIds.length > 0) {
      const [registered] = await connection.execute(
        `SELECT cj.judge_id, u.full_name
         FROM competition_judges cj
         JOIN users u ON cj.judge_id = u.id
         WHERE cj.competition_id = ? AND cj.status = 'registered' AND u.is_active = TRUE
           AND cj.judge_id IN (${judgeIds.map(() => '?').join(', ')})`,
        [competition_id, ...judgeIds]
      );

      const registeredIds = registered.map((r) => r.judge_id);
      const notRegistered = judgeIds.filter((id) => !registeredIds.includes(id));
      if (notRegistered.length > 0) {
        return res.status(400).json({
          success: false,
          message: 'Every assigned person must be registered for this competition'
        });
      }
    }

    await connection.beginTransaction();
    inTransaction = true;

    const [result] = await connection.execute(
      `INSERT INTO judge_panels
         (competition_id, competition_category_id, panel_name, panel_code, created_by)
       VALUES (?, ?, ?, ?, ?)`,
      [competition_id, competition_category_id, panel_name, panel_code || null, req.user.id]
    );

    const panelId = result.insertId;

    for (const { position, judgeId, memberName } of entries) {
      await connection.execute(
        `INSERT INTO panel_members (panel_id, judge_id, member_name, position, role)
         VALUES (?, ?, ?, ?, ?)`,
        [panelId, judgeId || null, memberName || null, position, position.startsWith('judge_') ? 'judge' : null]
      );

      // Mirror the scorer slot into panel_scorers, which score.routes.js still uses
      // to authorise score entry. Only possible for a real account.
      if (position === 'scorer' && judgeId) {
        await connection.execute(
          'INSERT INTO panel_scorers (panel_id, scorer_id) VALUES (?, ?)',
          [panelId, judgeId]
        );
      }
    }

    await connection.commit();
    inTransaction = false;

    await logActivity(
      req.user.id, 'PANEL_CREATED', 'judge_panels', panelId, null,
      {
        panel_name, competition_id, competition_category_id,
        assignments: Object.fromEntries(
          entries.map((e) => [e.position, e.judgeId ?? e.memberName])
        )
      }, req
    );

    res.status(201).json({
      success: true,
      message: 'Judge panel created successfully',
      data: { panelId, assigned: entries.length }
    });
  } catch (error) {
    if (inTransaction) await connection.rollback();
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({
        success: false,
        message: 'That person is already assigned to a slot on this panel'
      });
    }
    console.error('Create panel error:', error);
    res.status(500).json({ success: false, message: 'Failed to create panel' });
  } finally {
    connection.release();
  }
});

// Assign one person to one slot on an existing panel
router.post('/:id/members', authenticateToken, isAdmin, [
  param('id').isInt().withMessage('Valid panel ID is required'),
  body('position').isIn(PANEL_POSITION_VALUES).withMessage('Valid position is required'),
  validate
], async (req, res) => {
  const connection = await pool.getConnection();
  let inTransaction = false;
  try {
    const { judge_id, member_name, position } = req.body;
    const panelId = req.params.id;

    const parsed = normaliseAssignment(
      position,
      member_name !== undefined && member_name !== null && String(member_name).trim() !== ''
        ? { name: member_name }
        : { judge_id }
    );

    if (!parsed) {
      return res.status(400).json({
        success: false,
        message: 'Provide either a registered judge or a name'
      });
    }
    if (parsed.error) {
      return res.status(400).json({ success: false, message: parsed.error });
    }

    const [panels] = await connection.execute(
      'SELECT id, competition_id FROM judge_panels WHERE id = ? AND is_active = TRUE',
      [panelId]
    );

    if (panels.length === 0) {
      return res.status(404).json({ success: false, message: 'Panel not found' });
    }

    if (parsed.judgeId) {
      const [registered] = await connection.execute(
        `SELECT cj.judge_id FROM competition_judges cj
         JOIN users u ON cj.judge_id = u.id
         WHERE cj.competition_id = ? AND cj.judge_id = ?
           AND cj.status = 'registered' AND u.is_active = TRUE`,
        [panels[0].competition_id, parsed.judgeId]
      );

      if (registered.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'That person is not registered for this competition'
        });
      }

      // Already holding a different slot here?
      const [existing] = await connection.execute(
        'SELECT position FROM panel_members WHERE panel_id = ? AND judge_id = ? AND is_active = TRUE',
        [panelId, parsed.judgeId]
      );

      if (existing.length > 0) {
        return res.status(400).json({
          success: false,
          message: `Already assigned to this panel as ${POSITION_LABELS[existing[0].position]}`
        });
      }
    } else {
      // No unique key covers typed names, so check by hand
      const [existing] = await connection.execute(
        `SELECT position FROM panel_members
         WHERE panel_id = ? AND is_active = TRUE AND LOWER(member_name) = LOWER(?)`,
        [panelId, parsed.memberName]
      );

      if (existing.length > 0) {
        return res.status(400).json({
          success: false,
          message: `That name is already on this panel as ${POSITION_LABELS[existing[0].position]}`
        });
      }
    }

    const [slotTaken] = await connection.execute(
      'SELECT id FROM panel_members WHERE panel_id = ? AND position = ? AND is_active = TRUE',
      [panelId, position]
    );

    if (slotTaken.length > 0) {
      return res.status(400).json({
        success: false,
        message: `${POSITION_LABELS[position]} is already filled`
      });
    }

    await connection.beginTransaction();
    inTransaction = true;

    const [result] = await connection.execute(
      `INSERT INTO panel_members (panel_id, judge_id, member_name, position, role)
       VALUES (?, ?, ?, ?, ?)`,
      [panelId, parsed.judgeId || null, parsed.memberName || null, position,
       position.startsWith('judge_') ? 'judge' : null]
    );

    if (position === 'scorer' && parsed.judgeId) {
      await connection.execute(
        'INSERT INTO panel_scorers (panel_id, scorer_id) VALUES (?, ?)',
        [panelId, parsed.judgeId]
      );
    }

    await connection.commit();
    inTransaction = false;

    await logActivity(
      req.user.id, 'PANEL_MEMBER_ASSIGNED', 'judge_panels', panelId, null,
      { judge_id: parsed.judgeId || null, member_name: parsed.memberName || null, position }, req
    );

    res.status(201).json({
      success: true,
      message: `Assigned as ${POSITION_LABELS[position]}`,
      data: { memberId: result.insertId }
    });
  } catch (error) {
    if (inTransaction) await connection.rollback();
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({
        success: false,
        message: 'That slot is already filled, or the person already holds a slot on this panel'
      });
    }
    console.error('Assign panel member error:', error);
    res.status(500).json({ success: false, message: 'Failed to assign panel member' });
  } finally {
    connection.release();
  }
});

// Remove a person from a panel slot
router.delete('/:id/members/:memberId', authenticateToken, isAdmin, [
  param('id').isInt().withMessage('Valid panel ID is required'),
  param('memberId').isInt().withMessage('Valid member ID is required'),
  validate
], async (req, res) => {
  const connection = await pool.getConnection();
  let inTransaction = false;
  try {
    const { id: panelId, memberId } = req.params;

    const [members] = await connection.execute(
      'SELECT judge_id, member_name, position FROM panel_members WHERE id = ? AND panel_id = ?',
      [memberId, panelId]
    );

    if (members.length === 0) {
      return res.status(404).json({ success: false, message: 'Panel member not found' });
    }

    await connection.beginTransaction();
    inTransaction = true;

    // Hard delete so the slot and the person are both free to reassign;
    // unique_panel_position would otherwise keep blocking the slot.
    await connection.execute('DELETE FROM panel_members WHERE id = ? AND panel_id = ?', [memberId, panelId]);

    if (members[0].position === 'scorer' && members[0].judge_id) {
      await connection.execute(
        'DELETE FROM panel_scorers WHERE panel_id = ? AND scorer_id = ?',
        [panelId, members[0].judge_id]
      );
    }

    await connection.commit();
    inTransaction = false;

    await logActivity(
      req.user.id, 'PANEL_MEMBER_REMOVED', 'judge_panels', panelId,
      {
        judge_id: members[0].judge_id,
        member_name: members[0].member_name,
        position: members[0].position
      }, null, req
    );

    res.json({ success: true, message: 'Removed from panel' });
  } catch (error) {
    if (inTransaction) await connection.rollback();
    console.error('Remove panel member error:', error);
    res.status(500).json({ success: false, message: 'Failed to remove panel member' });
  } finally {
    connection.release();
  }
});

// Update panel
router.put('/:id', authenticateToken, isAdmin, [
  param('id').isInt().withMessage('Valid panel ID is required'),
  validate
], async (req, res) => {
  try {
    const { panel_name, panel_code, is_active } = req.body;

    await pool.execute(
      `UPDATE judge_panels SET
        panel_name = COALESCE(?, panel_name),
        panel_code = COALESCE(?, panel_code),
        is_active = COALESCE(?, is_active)
       WHERE id = ?`,
      [panel_name ?? null, panel_code ?? null, is_active ?? null, req.params.id]
    );

    await logActivity(req.user.id, 'PANEL_UPDATED', 'judge_panels', req.params.id, null, req.body, req);

    res.json({ success: true, message: 'Panel updated successfully' });
  } catch (error) {
    console.error('Update panel error:', error);
    res.status(500).json({ success: false, message: 'Failed to update panel' });
  }
});

// Delete a panel
router.delete('/:id', authenticateToken, isAdmin, [
  param('id').isInt().withMessage('Valid panel ID is required'),
  validate
], async (req, res) => {
  try {
    await pool.execute('UPDATE judge_panels SET is_active = FALSE WHERE id = ?', [req.params.id]);
    await logActivity(req.user.id, 'PANEL_DELETED', 'judge_panels', req.params.id, null, null, req);
    res.json({ success: true, message: 'Panel deleted' });
  } catch (error) {
    console.error('Delete panel error:', error);
    res.status(500).json({ success: false, message: 'Failed to delete panel' });
  }
});

module.exports = router;
