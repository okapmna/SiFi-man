const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const pool = require('../config/database');
const auth = require('../middleware/auth');
const fs = require('fs');
const crypto = require('crypto');
const { addLog } = require('../middleware/auditLog');

// Helper to ensure directory exists
const ensureDir = (dir) => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
};

// Ensure temp directory exists
const tempDir = path.join(__dirname, '../../firmware_storage/temp');
ensureDir(tempDir);

// Configure storage - Upload to a temp directory first
const upload = multer({ 
    dest: tempDir,
    fileFilter: (req, file, cb) => {
        if (path.extname(file.originalname) !== '.bin') {
            return cb(new Error('Only .bin files are allowed'));
        }
        cb(null, true);
    }
});

// POST endpoint for Firmware Upload
router.post('/', auth, upload.single('firmware'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ status: 'error', message: 'No file uploaded' });
    }

    const { version, device_type, release_notes, uploaded_by, checksum: providedChecksum, source_repo } = req.body;
    console.log(`Received upload request: device=${device_type}, version=${version}, uploaded_by=${uploaded_by || 'unknown'}, source_repo=${source_repo || 'none'}`);
    
    if (!version || !device_type) {
        if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
        return res.status(400).json({ status: 'error', message: 'Version and device_type are required' });
    }

    let conn;
    let finalPath;
    try {
        conn = await pool.getConnection();
        
        // 1. Validate device_type exists FIRST (prevent path traversal)
        let rows = await conn.query("SELECT id, type_name FROM device_types WHERE type_name = ?", [device_type]);
        
        if (rows.length === 0) {
            if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
            return res.status(400).json({ 
                status: 'error', 
                message: `Device type '${device_type}' is not registered. Please register it first.` 
            });
        }
        
        const deviceTypeId = rows[0].id;
        const trustedName = rows[0].type_name;

        // Build file paths using DB-trusted device type name
        const targetDir = path.join(__dirname, '../../firmware_storage', trustedName);
        ensureDir(targetDir);

        const ext = path.extname(req.file.originalname);
        const finalFilename = `${trustedName}_${version}_${Date.now()}${ext}`;
        finalPath = path.join(targetDir, finalFilename);

        // Move file from temp to final destination
        fs.renameSync(req.file.path, finalPath);
        console.log(`File moved to: ${finalPath}`);

        // Calculate checksum (SHA256) and file size
        const fileBuffer = fs.readFileSync(finalPath);
        const fileSize = fileBuffer.length;
        const computedChecksum = crypto.createHash('sha256').update(fileBuffer).digest('hex');

        if (providedChecksum && computedChecksum !== providedChecksum) {
            if (fs.existsSync(finalPath)) fs.unlinkSync(finalPath);
            return res.status(400).json({
                status: 'error',
                message: `SHA256 checksum mismatch. Provided: ${providedChecksum}, Computed: ${computedChecksum}`
            });
        }

        // 2. Insert into firmwares table using device_type_id
        await conn.query(
            "INSERT INTO firmwares (version, device_type_id, filename, file_path, checksum, file_size, notes, uploaded_by, source_repo) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            [version, deviceTypeId, finalFilename, finalPath, computedChecksum, fileSize, release_notes || null, uploaded_by || 'api_key', source_repo || null]
        );

        await addLog({
            action: 'firmware_uploaded_api',
            entity_type: 'firmware',
            details: `API upload: ${version} for ${trustedName} (${finalFilename}) by ${uploaded_by || 'api_key'}`,
            performed_by: uploaded_by || 'api_key',
            ip_address: req.ip
        });

        res.status(201).json({
            status: 'success',
            message: `Firmware uploaded successfully to folder: ${trustedName}`,
            data: {
                version,
                device_type: trustedName,
                device_type_id: deviceTypeId,
                filename: finalFilename,
                checksum: computedChecksum,
                uploaded_by: uploaded_by || 'api_key',
                release_notes: release_notes || null,
                source_repo: source_repo || null,
                storage_path: finalPath
            }
        });
    } catch (err) {
        console.error('Upload error:', err);
        if (finalPath && fs.existsSync(finalPath)) fs.unlinkSync(finalPath);
        if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
        res.status(500).json({ status: 'error', message: 'An error occurred during upload processing' });
    } finally {
        if (conn) conn.release();
    }
});

module.exports = router;
