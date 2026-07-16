const express = require('express');
const router = express.Router();
const { pool } = require('../db/database');
const { authenticateToken } = require('../middleware/auth');

// GET /api/device-notes/:deviceId - Get all notes for a specific device
router.get('/:deviceId', authenticateToken, async (req, res) => {
  try {
    const { deviceId } = req.params;
    const result = await pool.query(`
      SELECT dn.id, dn.note, dn.created_at, u.name as author_name 
      FROM device_notes dn
      LEFT JOIN users u ON dn.created_by = u.id
      WHERE dn.device_id = $1
      ORDER BY dn.created_at DESC
    `, [deviceId]);
    
    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('Error fetching device notes:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/device-notes - Add a new note to a device
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { device_id, note } = req.body;
    const userId = req.user.id; // from authenticateToken
    
    if (!device_id || !note) {
      return res.status(400).json({ error: 'device_id and note are required' });
    }
    
    const result = await pool.query(`
      INSERT INTO device_notes (device_id, note, created_by)
      VALUES ($1, $2, $3)
      RETURNING *
    `, [device_id, note, userId]);
    
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Error adding device note:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;