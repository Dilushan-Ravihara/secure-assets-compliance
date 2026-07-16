const express = require('express');
const fs = require('fs');
const path = require('path');
const { authenticateToken, requireRole } = require('../middleware/auth');
const router = express.Router();

router.use(authenticateToken);

const SETTINGS_FILE = path.join(__dirname, '../config/settings.json');

// Ensure config dir exists
if (!fs.existsSync(path.dirname(SETTINGS_FILE))) {
  fs.mkdirSync(path.dirname(SETTINGS_FILE), { recursive: true });
}

// Get system settings
router.get('/', (req, res) => {
  try {
    if (fs.existsSync(SETTINGS_FILE)) {
      const data = fs.readFileSync(SETTINGS_FILE, 'utf8');
      res.json({ success: true, data: JSON.parse(data) });
    } else {
      res.json({ success: true, data: {} });
    }
  } catch (error) {
    res.status(500).json({ error: 'Failed to read settings' });
  }
});

// Update system settings (admin only)
router.post('/', requireRole('super_admin', 'admin'), (req, res) => {
  try {
    const currentSettings = fs.existsSync(SETTINGS_FILE) 
      ? JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8')) 
      : {};
      
    const newSettings = { ...currentSettings, ...req.body };
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(newSettings, null, 2));
    
    // If SMTP settings were updated, we could re-initialize nodemailer transport here
    // but the emailService reads from process.env OR we can make it read from this file
    
    res.json({ success: true, data: newSettings });
  } catch (error) {
    res.status(500).json({ error: 'Failed to save settings' });
  }
});

// Backup route (placeholder)
router.post('/backup', requireRole('super_admin', 'admin'), (req, res) => {
  // Simulate backup process
  res.json({ 
    success: true, 
    downloadUrl: `http://localhost:5000/mock-backup.sql`,
    filename: `backup_${new Date().toISOString().replace(/[:.]/g, '-')}.sql` 
  });
});

module.exports = router;