const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const pool = require('../config/database');

// Check for update
// ESP32 usually sends headers: x-ESP32-version, x-ESP32-STA-MAC, x-ESP32-mode
router.get('/check', async (req, res) => {
    const currentVersion = req.query.version || req.headers['x-esp32-version'];
    const deviceType = req.query.device || req.headers['x-esp32-device'] || 'esp32';

    if (!currentVersion) {
        return res.status(400).json({ status: 'error', message: 'Current version is required' });
    }

    let conn;
    try {
        conn = await pool.getConnection();
        // Phase 3: Only return firmwares explicitly marked as active by admin
        const rows = await conn.query(`
            SELECT f.* 
            FROM firmwares f
            JOIN device_types dt ON f.device_type_id = dt.id
            WHERE dt.type_name = ? AND f.is_active = TRUE
            LIMIT 1
        `, [deviceType]);

        if (rows.length === 0) {
            return res.status(404).json({ status: 'no_update', message: 'No firmware found for this device' });
        }

        const latest = rows[0];
        
        if (latest.version !== currentVersion) {
            return res.json({
                status: 'update_available',
                version: latest.version,
                url: `/api/ota/download/${latest.filename}`,
                checksum: latest.checksum
            });
        } else {
            return res.json({ status: 'up_to_date', version: currentVersion });
        }
    } catch (err) {
        console.error('Database error:', err);
        res.status(500).json({ status: 'error', message: 'Internal Server Error' });
    } finally {
        if (conn) conn.release();
    }
});

// Download firmware
router.get('/download/:filename', async (req, res) => {
    const filename = req.params.filename;
    
    let conn;
    try {
        conn = await pool.getConnection();
        const rows = await conn.query("SELECT file_path FROM firmwares WHERE filename = ?", [filename]);
        
        if (rows.length === 0) {
            return res.status(404).json({ status: 'error', message: 'Firmware record not found' });
        }

        const filePath = rows[0].file_path;

        if (fs.existsSync(filePath)) {
            res.download(filePath);
        } else {
            res.status(404).json({ status: 'error', message: 'Firmware file missing on disk' });
        }
    } catch (err) {
        console.error('Download error:', err);
        res.status(500).json({ status: 'error', message: 'Internal Server Error' });
    } finally {
        if (conn) conn.release();
    }
});

module.exports = router;
