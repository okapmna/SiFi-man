const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const rateLimit = require('express-rate-limit');
const pool = require('../config/database');
const { getStorage } = require('../services/storage');

const storage = getStorage();

// Rate limiter: firmware check (60 requests per 15 minutes)
const checkLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 60,
    message: { status: 'error', message: 'Too many check requests. Try again later.' },
    standardHeaders: true,
    legacyHeaders: false,
});

// Rate limiter: firmware download (10 requests per 15 minutes)
const downloadLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: { status: 'error', message: 'Too many download requests. Try again later.' },
    standardHeaders: true,
    legacyHeaders: false,
});

// Check for update
// ESP32 usually sends headers: x-ESP32-version, x-ESP32-STA-MAC, x-ESP32-mode
router.get('/check', checkLimiter, async (req, res) => {
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
            return res.status(200).json({ status: 'no_update', message: 'No firmware found for this device' });
        }

        const latest = rows[0];
        
        if (latest.version !== currentVersion) {
            return res.json({
                status: 'update_available',
                version: latest.version,
                url: `/ota/download/${latest.filename}`,
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
router.get('/download/:filename', downloadLimiter, async (req, res) => {
    const filename = req.params.filename;
    
    let conn;
    try {
        conn = await pool.getConnection();
        const rows = await conn.query("SELECT file_path FROM firmwares WHERE filename = ?", [filename]);
        
        if (rows.length === 0) {
            return res.status(404).json({ status: 'error', message: 'Firmware record not found' });
        }

        const filePath = rows[0].file_path;

        // Prioritaskan Supabase signed URL — stream langsung (no redirect, biar ESP32 bisa)
        const signedUrl = await storage.getDownloadUrl(filePath);
        if (signedUrl) {
            const response = await axios({
                method: 'GET',
                url: signedUrl,
                responseType: 'stream'
            });
            res.setHeader('Content-Type', 'application/octet-stream');
            res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
            response.data.pipe(res);
            return;
        }

        // Fallback ke local filesystem
        const localPath = storage.getLocalPath(filePath);
        if (localPath && fs.existsSync(localPath)) {
            return res.download(localPath);
        }

        res.status(404).json({ status: 'error', message: 'Firmware file not found' });
    } catch (err) {
        console.error('Download error:', err);
        res.status(500).json({ status: 'error', message: 'Internal Server Error' });
    } finally {
        if (conn) conn.release();
    }
});

module.exports = router;
