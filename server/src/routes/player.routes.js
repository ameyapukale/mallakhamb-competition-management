const express = require('express');
const router = express.Router();
const { body, param } = require('express-validator');
const { pool } = require('../config/database');
const { validate } = require('../middleware/validation.middleware');
const { authenticateToken, isTeamManager } = require('../middleware/auth.middleware');
const { logActivity } = require('../utils/activityLogger');
const { getPersonAccountIds, ownsRecord } = require('../utils/accountIdentity');
const { v4: uuidv4 } = require('uuid');
const { resolveAgeGroup, checkAgeGroupGender } = require('../utils/ageGroups');

// Age group for a date of birth. Gender-aware: age groups name a gender
// ("U12 Boys", "A16 Girls"), so a male player is never filed under a Girls group.
const calculateAgeGroup = (dateOfBirth, gender) => resolveAgeGroup(pool, dateOfBirth, gender);

// Get all players
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { team_id, age_group_id, category, gender } = req.query;
    let query = `
      SELECT p.*, t.team_name, ag.group_name as age_group_name
      FROM players p
      LEFT JOIN teams t ON p.team_id = t.id
      LEFT JOIN age_groups ag ON p.age_group_id = ag.id
      WHERE p.is_active = TRUE
    `;
    const params = [];

    if (team_id) {
      query += ' AND p.team_id = ?';
      params.push(team_id);
    }
    if (age_group_id) {
      query += ' AND p.age_group_id = ?';
      params.push(age_group_id);
    }
    if (category) {
      query += ' AND p.category = ?';
      params.push(category);
    }
    if (gender) {
      query += ' AND p.gender = ?';
      params.push(gender);
    }

    // A team manager sees their own teams' players, across all of their accounts
    if (req.user.role === 'team_manager') {
      const accountIds = await getPersonAccountIds(pool, req.user);
      query += ` AND t.manager_id IN (${accountIds.map(() => '?').join(', ')})`;
      params.push(...accountIds);
    }

    query += ' ORDER BY p.created_at DESC';

    const [players] = await pool.execute(query, params);
    res.json({ success: true, data: players });
  } catch (error) {
    console.error('Get players error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch players' });
  }
});

// Get player by ID
router.get('/:id', authenticateToken, [
  param('id').isInt().withMessage('Valid player ID is required'),
  validate
], async (req, res) => {
  try {
    const [players] = await pool.execute(
      `SELECT p.*, t.team_name, ag.group_name as age_group_name
       FROM players p
       LEFT JOIN teams t ON p.team_id = t.id
       LEFT JOIN age_groups ag ON p.age_group_id = ag.id
       WHERE p.id = ?`,
      [req.params.id]
    );

    if (players.length === 0) {
      return res.status(404).json({ success: false, message: 'Player not found' });
    }

    res.json({ success: true, data: players[0] });
  } catch (error) {
    console.error('Get player error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch player' });
  }
});

// Create player
router.post('/', authenticateToken, isTeamManager, [
  body('team_id').isInt().withMessage('Team ID is required'),
  body('first_name').trim().notEmpty().withMessage('First name is required'),
  body('last_name').trim().notEmpty().withMessage('Last name is required'),
  body('date_of_birth').isDate().withMessage('Valid date of birth is required'),
  body('gender').isIn(['male', 'female', 'other']).withMessage('Valid gender is required'),
  body('category').isIn(['pole', 'rope', 'hanging']).withMessage('Valid category is required'),
  validate
], async (req, res) => {
  try {
    const { 
      team_id, first_name, last_name, date_of_birth, gender, category,
      aadhar_number, photo_url, height_cm, weight_kg, experience_years, 
      achievements, medical_certificate_url 
    } = req.body;

    // Verify team ownership
    const [teams] = await pool.execute('SELECT manager_id FROM teams WHERE id = ?', [team_id]);
    if (teams.length === 0) {
      return res.status(404).json({ success: false, message: 'Team not found' });
    }
    if (!ownsRecord(req.user, teams[0].manager_id, await getPersonAccountIds(pool, req.user))) {
      return res.status(403).json({ success: false, message: 'Unauthorized' });
    }

    // An explicit age group must not contradict the player's gender
    if (req.body.age_group_id) {
      const clash = await checkAgeGroupGender(pool, req.body.age_group_id, gender);
      if (clash) return res.status(400).json({ success: false, message: clash });
    }

    const age_group_id = req.body.age_group_id || await calculateAgeGroup(date_of_birth, gender);

    // Generate registration number
    const registration_number = `PL-${uuidv4().slice(0, 8).toUpperCase()}`;

    const [result] = await pool.execute(
      `INSERT INTO players (team_id, first_name, last_name, date_of_birth, gender, age_group_id, 
        registration_number, aadhar_number, photo_url, height_cm, weight_kg, category, 
        experience_years, achievements, medical_certificate_url)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [team_id, first_name, last_name, date_of_birth, gender, age_group_id,
       registration_number, aadhar_number || null, photo_url || null, height_cm || null, weight_kg || null, category,
       experience_years || 0, achievements || null, medical_certificate_url || null]
    );

    await logActivity(req.user.id, 'PLAYER_CREATED', 'players', result.insertId, null, req.body, req);

    res.status(201).json({
      success: true,
      message: 'Player added successfully',
      data: { playerId: result.insertId, registration_number, age_group_id }
    });
  } catch (error) {
    console.error('Create player error:', error);
    res.status(500).json({ success: false, message: 'Failed to add player' });
  }
});

// Bulk add players
router.post('/bulk', authenticateToken, isTeamManager, [
  body('team_id').isInt().withMessage('Team ID is required'),
  body('players').isArray({ min: 1 }).withMessage('Players array is required'),
  validate
], async (req, res) => {
  const connection = await pool.getConnection();
  try {
    const { team_id, players } = req.body;

    // Verify team ownership
    const [teams] = await connection.execute('SELECT manager_id FROM teams WHERE id = ?', [team_id]);
    if (teams.length === 0) {
      return res.status(404).json({ success: false, message: 'Team not found' });
    }
    if (!ownsRecord(req.user, teams[0].manager_id, await getPersonAccountIds(pool, req.user))) {
      return res.status(403).json({ success: false, message: 'Unauthorized' });
    }

    await connection.beginTransaction();

    const addedPlayers = [];
    for (const player of players) {
      const age_group_id = await calculateAgeGroup(player.date_of_birth, player.gender);
      const registration_number = `PL-${uuidv4().slice(0, 8).toUpperCase()}`;

      const [result] = await connection.execute(
        `INSERT INTO players (team_id, first_name, last_name, date_of_birth, gender, age_group_id, 
          registration_number, category, experience_years)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [team_id, player.first_name, player.last_name, player.date_of_birth, player.gender, 
         age_group_id, registration_number, player.category, player.experience_years || 0]
      );

      addedPlayers.push({ playerId: result.insertId, registration_number, ...player });
    }

    await connection.commit();

    await logActivity(req.user.id, 'PLAYERS_BULK_ADDED', 'players', team_id, null, { count: players.length }, req);

    res.status(201).json({
      success: true,
      message: `${addedPlayers.length} players added successfully`,
      data: addedPlayers
    });
  } catch (error) {
    await connection.rollback();
    console.error('Bulk add players error:', error);
    res.status(500).json({ success: false, message: 'Failed to add players' });
  } finally {
    connection.release();
  }
});

// Update player
router.put('/:id', authenticateToken, isTeamManager, [
  param('id').isInt().withMessage('Valid player ID is required'),
  validate
], async (req, res) => {
  try {
    const playerId = req.params.id;

    // Get player and verify ownership
    const [players] = await pool.execute(
      `SELECT p.*, t.manager_id FROM players p 
       JOIN teams t ON p.team_id = t.id 
       WHERE p.id = ?`,
      [playerId]
    );

    if (players.length === 0) {
      return res.status(404).json({ success: false, message: 'Player not found' });
    }

    if (!ownsRecord(req.user, players[0].manager_id, await getPersonAccountIds(pool, req.user))) {
      return res.status(403).json({ success: false, message: 'Unauthorized' });
    }

    const { 
      first_name, last_name, date_of_birth, gender, category,
      aadhar_number, photo_url, height_cm, weight_kg, experience_years, 
      achievements, medical_certificate_url 
    } = req.body;

    // Gender or date of birth changing can both move the player's age group.
    // Recalculate against the values that will apply after this update.
    const nextGender = gender ?? players[0].gender;
    const nextDob = date_of_birth ?? players[0].date_of_birth;

    let age_group_id;
    if (req.body.age_group_id) {
      const clash = await checkAgeGroupGender(pool, req.body.age_group_id, nextGender);
      if (clash) return res.status(400).json({ success: false, message: clash });
      age_group_id = req.body.age_group_id;
    } else if (date_of_birth || gender) {
      age_group_id = await calculateAgeGroup(nextDob, nextGender);
    } else {
      age_group_id = players[0].age_group_id;
    }

    // Never leave a player in a group that contradicts their gender
    const stillClashes = await checkAgeGroupGender(pool, age_group_id, nextGender);
    if (stillClashes) {
      age_group_id = await calculateAgeGroup(nextDob, nextGender);
    }

    await pool.execute(
      `UPDATE players SET 
        first_name = COALESCE(?, first_name),
        last_name = COALESCE(?, last_name),
        date_of_birth = COALESCE(?, date_of_birth),
        gender = COALESCE(?, gender),
        age_group_id = ?,
        aadhar_number = COALESCE(?, aadhar_number),
        photo_url = COALESCE(?, photo_url),
        height_cm = COALESCE(?, height_cm),
        weight_kg = COALESCE(?, weight_kg),
        category = COALESCE(?, category),
        experience_years = COALESCE(?, experience_years),
        achievements = COALESCE(?, achievements),
        medical_certificate_url = COALESCE(?, medical_certificate_url)
       WHERE id = ?`,
      // mysql2 rejects `undefined` bind parameters, and COALESCE(?, col) is what
      // keeps an omitted field unchanged — so undefined has to become null here.
      [first_name, last_name, date_of_birth, gender, age_group_id,
       aadhar_number, photo_url, height_cm, weight_kg, category,
       experience_years, achievements, medical_certificate_url, playerId]
        .map((v) => (v === undefined ? null : v))
    );

    await logActivity(req.user.id, 'PLAYER_UPDATED', 'players', playerId, players[0], req.body, req);

    res.json({ success: true, message: 'Player updated successfully' });
  } catch (error) {
    console.error('Update player error:', error);
    res.status(500).json({ success: false, message: 'Failed to update player' });
  }
});

// Bulk update players
router.put('/bulk', authenticateToken, isTeamManager, [
  body('players').isArray({ min: 1 }).withMessage('Players array is required'),
  validate
], async (req, res) => {
  const connection = await pool.getConnection();
  try {
    const { players } = req.body;

    await connection.beginTransaction();

    let updatedCount = 0;
    for (const playerData of players) {
      if (!playerData.id) continue;

      // Verify ownership for each player
      const [existing] = await connection.execute(
        `SELECT p.*, t.manager_id FROM players p 
         JOIN teams t ON p.team_id = t.id 
         WHERE p.id = ?`,
        [playerData.id]
      );

      if (existing.length === 0) continue;
      if (!ownsRecord(req.user, existing[0].manager_id, await getPersonAccountIds(pool, req.user))) continue;

      const { 
        id, first_name, last_name, date_of_birth, gender, category,
        height_cm, weight_kg, experience_years, aadhar_number, achievements 
      } = playerData;

      // Recalculate when the date of birth or the gender changes, and never leave
      // a player in a group that names the other gender
      const nextGender = gender || existing[0].gender;
      const nextDob = date_of_birth || existing[0].date_of_birth;
      const dobChanged = date_of_birth &&
        date_of_birth !== existing[0].date_of_birth?.toISOString()?.split('T')[0];

      let age_group_id = existing[0].age_group_id;
      if (dobChanged || (gender && gender !== existing[0].gender)) {
        age_group_id = await calculateAgeGroup(nextDob, nextGender);
      } else if (await checkAgeGroupGender(pool, age_group_id, nextGender)) {
        age_group_id = await calculateAgeGroup(nextDob, nextGender);
      }

      await connection.execute(
        `UPDATE players SET 
          first_name = COALESCE(?, first_name),
          last_name = COALESCE(?, last_name),
          date_of_birth = COALESCE(?, date_of_birth),
          gender = COALESCE(?, gender),
          age_group_id = COALESCE(?, age_group_id),
          category = COALESCE(?, category),
          height_cm = COALESCE(?, height_cm),
          weight_kg = COALESCE(?, weight_kg),
          experience_years = COALESCE(?, experience_years),
          aadhar_number = COALESCE(?, aadhar_number),
          achievements = COALESCE(?, achievements)
         WHERE id = ?`,
        [first_name || null, last_name || null, date_of_birth || null, gender || null, 
         age_group_id, category || null, height_cm || null, weight_kg || null, 
         experience_years || null, aadhar_number || null, achievements || null, id]
      );

      updatedCount++;
    }

    await connection.commit();

    await logActivity(req.user.id, 'PLAYERS_BULK_UPDATED', 'players', null, null, { count: updatedCount }, req);

    res.json({
      success: true,
      message: `${updatedCount} player(s) updated successfully`
    });
  } catch (error) {
    await connection.rollback();
    console.error('Bulk update players error:', error);
    res.status(500).json({ success: false, message: 'Failed to update players' });
  } finally {
    connection.release();
  }
});

// Delete player (soft delete)
router.delete('/:id', authenticateToken, isTeamManager, [
  param('id').isInt().withMessage('Valid player ID is required'),
  validate
], async (req, res) => {
  try {
    const playerId = req.params.id;

    // Verify ownership
    const [players] = await pool.execute(
      `SELECT p.*, t.manager_id FROM players p 
       JOIN teams t ON p.team_id = t.id 
       WHERE p.id = ?`,
      [playerId]
    );

    if (players.length === 0) {
      return res.status(404).json({ success: false, message: 'Player not found' });
    }

    if (!ownsRecord(req.user, players[0].manager_id, await getPersonAccountIds(pool, req.user))) {
      return res.status(403).json({ success: false, message: 'Unauthorized' });
    }

    await pool.execute('UPDATE players SET is_active = FALSE WHERE id = ?', [playerId]);
    await logActivity(req.user.id, 'PLAYER_DELETED', 'players', playerId, null, null, req);

    res.json({ success: true, message: 'Player removed successfully' });
  } catch (error) {
    console.error('Delete player error:', error);
    res.status(500).json({ success: false, message: 'Failed to remove player' });
  }
});

// Get players by age group for a team
router.get('/team/:teamId/by-age-group', authenticateToken, async (req, res) => {
  try {
    const [players] = await pool.execute(
      `SELECT p.*, ag.group_name as age_group_name
       FROM players p
       LEFT JOIN age_groups ag ON p.age_group_id = ag.id
       WHERE p.team_id = ? AND p.is_active = TRUE
       ORDER BY ag.min_age, p.first_name`,
      [req.params.teamId]
    );

    // Group by age group
    const grouped = players.reduce((acc, player) => {
      const group = player.age_group_name || 'Unknown';
      if (!acc[group]) acc[group] = [];
      acc[group].push(player);
      return acc;
    }, {});

    res.json({ success: true, data: grouped });
  } catch (error) {
    console.error('Get players by age group error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch players' });
  }
});

module.exports = router;
