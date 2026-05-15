const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const pool = require('../config/database');
const sessionAuth = require('../middleware/sessionAuth');

// ==========================================
// MULTER SETUP FOR ADMIN UPLOAD
// ==========================================
const ensureDir = (dir) => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
};
const tempDir = path.join(__dirname, '../../firmware_storage/temp');
ensureDir(tempDir);

const upload = multer({
    dest: tempDir,
    fileFilter: (req, file, cb) => {
        if (path.extname(file.originalname) !== '.bin') {
            return cb(new Error('Only .bin files are allowed'));
        }
        cb(null, true);
    }
});

// GET /admin/login - Halaman form login
router.get('/login', (req, res) => {
    // Jika sudah login, redirect ke dashboard
    if (req.session && req.session.adminId) {
        return res.redirect('/admin/dashboard');
    }
    const error = req.session.error;
    req.session.error = null; // Clear error setelah ditampilkan
    res.render('login', { error });
});

// POST /admin/login - Proses login
router.post('/login', async (req, res) => {
    const { username, password } = req.body;
    let conn;

    try {
        conn = await pool.getConnection();
        const rows = await conn.query("SELECT * FROM admin_users WHERE username = ?", [username]);

        if (rows.length > 0) {
            const admin = rows[0];
            const isMatch = await bcrypt.compare(password, admin.password_hash);

            if (isMatch) {
                req.session.adminId = admin.id;
                req.session.username = admin.username;
                return res.redirect('/admin/dashboard');
            }
        }

        // Login gagal
        req.session.error = 'Invalid username or password';
        res.redirect('/admin/login');
    } catch (error) {
        console.error('Login error:', error);
        req.session.error = 'Internal server error';
        res.redirect('/admin/login');
    } finally {
        if (conn) conn.release();
    }
});

// POST /admin/logout - Logout & destroy session
router.post('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            console.error('Logout error:', err);
        }
        res.redirect('/admin/login');
    });
});

// GET /admin/logout - Untuk kemudahan via link jika diperlukan, idealnya pakai POST
router.get('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            console.error('Logout error:', err);
        }
        res.redirect('/admin/login');
    });
});

// ==========================================
// PROTECTED ROUTES
// ==========================================
router.use(sessionAuth);

// GET /admin/dashboard
router.get('/dashboard', async (req, res) => {
    let conn;
    try {
        conn = await pool.getConnection();
        
        // Stats
        const totalDevices = await conn.query("SELECT COUNT(*) as count FROM device_types");
        const totalFirmwares = await conn.query("SELECT COUNT(*) as count FROM firmwares");
        
        const recentUploads = await conn.query(`
            SELECT f.id, f.version, f.filename, f.created_at, dt.type_name
            FROM firmwares f
            JOIN device_types dt ON f.device_type_id = dt.id
            ORDER BY f.created_at DESC
            LIMIT 10
        `);

        res.render('admin/dashboard', {
            username: req.session.username,
            totalDevices: Number(totalDevices[0].count),
            totalFirmwares: Number(totalFirmwares[0].count),
            recentUploads
        });
    } catch (error) {
        console.error('Dashboard error:', error);
        res.status(500).send('Internal Server Error');
    } finally {
        if (conn) conn.release();
    }
});

// GET /admin/devices
router.get('/devices', async (req, res) => {
    let conn;
    try {
        conn = await pool.getConnection();
        const devices = await conn.query(`
            SELECT dt.id, dt.type_name, dt.description, dt.created_at,
                   (SELECT COUNT(*) FROM firmwares f WHERE f.device_type_id = dt.id) as firmware_count
            FROM device_types dt
            ORDER BY dt.created_at DESC
        `);
        
        // Helper untuk parse BigInt jika perlu, walau di view bisa langsung toString
        const formattedDevices = devices.map(d => ({
            ...d,
            firmware_count: Number(d.firmware_count)
        }));

        res.render('admin/devices', {
            username: req.session.username,
            devices: formattedDevices
        });
    } catch (error) {
        console.error('Devices error:', error);
        res.status(500).send('Internal Server Error');
    } finally {
        if (conn) conn.release();
    }
});

// POST /admin/devices
router.post('/devices', async (req, res) => {
    let conn;
    try {
        const { type_name, description } = req.body;
        conn = await pool.getConnection();
        await conn.query(
            "INSERT INTO device_types (type_name, description) VALUES (?, ?)",
            [type_name, description]
        );
        res.redirect('/admin/devices');
    } catch (error) {
        console.error('Add device error:', error);
        // Handle constraint errors properly in a real app, here we just return error text
        res.status(500).send('Failed to add device. Maybe duplicate name?');
    } finally {
        if (conn) conn.release();
    }
});

// PUT /admin/devices/:id
router.put('/devices/:id', async (req, res) => {
    let conn;
    try {
        const { type_name, description } = req.body;
        const deviceId = req.params.id;
        conn = await pool.getConnection();
        await conn.query(
            "UPDATE device_types SET type_name = ?, description = ? WHERE id = ?",
            [type_name, description, deviceId]
        );
        res.json({ success: true });
    } catch (error) {
        console.error('Edit device error:', error);
        res.status(500).json({ error: 'Failed to update device' });
    } finally {
        if (conn) conn.release();
    }
});

// DELETE /admin/devices/:id
router.delete('/devices/:id', async (req, res) => {
    let conn;
    try {
        const deviceId = req.params.id;
        conn = await pool.getConnection();
        
        // Check if there are firmwares
        const firmwares = await conn.query("SELECT COUNT(*) as count FROM firmwares WHERE device_type_id = ?", [deviceId]);
        if (Number(firmwares[0].count) > 0) {
            return res.status(400).json({ error: 'Cannot delete device with existing firmwares' });
        }

        await conn.query("DELETE FROM device_types WHERE id = ?", [deviceId]);
        res.json({ success: true });
    } catch (error) {
        console.error('Delete device error:', error);
        res.status(500).json({ error: 'Failed to delete device' });
    } finally {
        if (conn) conn.release();
    }
});

// ==========================================
// FIRMWARE MANAGEMENT ROUTES
// ==========================================

// GET /admin/firmwares
router.get('/firmwares', async (req, res) => {
    let conn;
    try {
        conn = await pool.getConnection();
        const deviceFilter = req.query.device || '';

        let query = `
            SELECT f.id, f.version, f.filename, f.file_size, f.checksum,
                   f.is_active, f.notes, f.created_at, dt.type_name, dt.id as device_type_id
            FROM firmwares f
            JOIN device_types dt ON f.device_type_id = dt.id
        `;
        const params = [];
        if (deviceFilter) {
            query += ` WHERE dt.type_name = ?`;
            params.push(deviceFilter);
        }
        query += ` ORDER BY f.created_at DESC`;

        const firmwares = await conn.query(query, params);
        const deviceTypes = await conn.query(`SELECT id, type_name FROM device_types ORDER BY type_name`);

        // Back-fill file_size from disk for firmwares missing it in DB
        const enriched = firmwares.map(f => {
            let fileSize = (f.file_size !== null && f.file_size !== undefined) ? Number(f.file_size) : null;
            if (!fileSize && f.file_path) {
                try {
                    const stat = fs.statSync(f.file_path);
                    fileSize = stat.size;
                } catch (e) {
                    // file may not exist on disk
                    fileSize = null;
                }
            }
            return {
                ...f,
                id: Number(f.id),
                device_type_id: Number(f.device_type_id),
                is_active: Boolean(f.is_active),
                file_size: fileSize
            };
        });

        res.render('admin/firmwares', {
            username: req.session.username,
            firmwares: enriched,
            deviceTypes,
            deviceFilter,
            success: req.query.success || null,
            error: req.query.error || null
        });
    } catch (err) {
        console.error('Firmwares error:', err);
        res.status(500).send('Internal Server Error');
    } finally {
        if (conn) conn.release();
    }
});

// PATCH /admin/firmwares/:id/activate — set firmware as active
router.patch('/firmwares/:id/activate', async (req, res) => {
    let conn;
    try {
        const firmwareId = req.params.id;
        conn = await pool.getConnection();

        const rows = await conn.query('SELECT device_type_id FROM firmwares WHERE id = ?', [firmwareId]);
        if (rows.length === 0) {
            return res.status(404).json({ error: 'Firmware not found' });
        }
        const deviceTypeId = rows[0].device_type_id;

        // Deactivate all firmwares for this device type, then activate target
        await conn.query('UPDATE firmwares SET is_active = FALSE WHERE device_type_id = ?', [deviceTypeId]);
        await conn.query('UPDATE firmwares SET is_active = TRUE WHERE id = ?', [firmwareId]);

        res.json({ success: true });
    } catch (err) {
        console.error('Activate firmware error:', err);
        res.status(500).json({ error: 'Failed to activate firmware' });
    } finally {
        if (conn) conn.release();
    }
});

// DELETE /admin/firmwares/:id
router.delete('/firmwares/:id', async (req, res) => {
    let conn;
    try {
        const firmwareId = req.params.id;
        conn = await pool.getConnection();

        const rows = await conn.query('SELECT file_path, is_active FROM firmwares WHERE id = ?', [firmwareId]);
        if (rows.length === 0) {
            return res.status(404).json({ error: 'Firmware not found' });
        }
        if (rows[0].is_active) {
            return res.status(400).json({ error: 'Cannot delete the active firmware. Please activate another firmware first.' });
        }

        const filePath = rows[0].file_path;
        await conn.query('DELETE FROM firmwares WHERE id = ?', [firmwareId]);

        // Remove file from disk
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }

        res.json({ success: true });
    } catch (err) {
        console.error('Delete firmware error:', err);
        res.status(500).json({ error: 'Failed to delete firmware' });
    } finally {
        if (conn) conn.release();
    }
});

// ==========================================
// ADMIN UPLOAD ROUTES
// ==========================================

// GET /admin/upload — show upload form
router.get('/upload', async (req, res) => {
    let conn;
    try {
        conn = await pool.getConnection();
        const deviceTypes = await conn.query('SELECT id, type_name FROM device_types ORDER BY type_name');
        res.render('admin/upload', {
            username: req.session.username,
            deviceTypes,
            success: req.query.success || null,
            error: req.query.error || null
        });
    } catch (err) {
        console.error('Upload page error:', err);
        res.status(500).send('Internal Server Error');
    } finally {
        if (conn) conn.release();
    }
});

// POST /admin/upload — handle firmware file upload
router.post('/upload', upload.single('firmware'), async (req, res) => {
    if (!req.file) {
        return res.redirect('/admin/upload?error=No+file+uploaded');
    }

    const { version, device_type, notes, set_active } = req.body;

    if (!version || !device_type) {
        if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
        return res.redirect('/admin/upload?error=Version+and+device+type+are+required');
    }

    const targetDir = path.join(__dirname, '../../firmware_storage', device_type);
    ensureDir(targetDir);

    const ext = path.extname(req.file.originalname);
    const finalFilename = `${device_type}_${version}_${Date.now()}${ext}`;
    const finalPath = path.join(targetDir, finalFilename);

    let conn;
    try {
        conn = await pool.getConnection();

        const rows = await conn.query('SELECT id FROM device_types WHERE type_name = ?', [device_type]);
        if (rows.length === 0) {
            if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
            return res.redirect('/admin/upload?error=Device+type+not+found');
        }
        const deviceTypeId = rows[0].id;

        // Move file from temp to final destination
        fs.renameSync(req.file.path, finalPath);

        // Calculate checksum and file size
        const fileBuffer = fs.readFileSync(finalPath);
        const checksum = crypto.createHash('md5').update(fileBuffer).digest('hex');
        const fileSize = fileBuffer.length;

        const isActive = set_active === 'on' || set_active === '1' || set_active === 'true';

        // If marking active, deactivate siblings first
        if (isActive) {
            await conn.query('UPDATE firmwares SET is_active = FALSE WHERE device_type_id = ?', [deviceTypeId]);
        }

        await conn.query(
            'INSERT INTO firmwares (version, device_type_id, filename, file_path, checksum, file_size, notes, is_active) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            [version, deviceTypeId, finalFilename, finalPath, checksum, fileSize, notes || null, isActive]
        );

        res.redirect('/admin/firmwares?success=Firmware+uploaded+successfully');
    } catch (err) {
        console.error('Admin upload error:', err);
        if (fs.existsSync(finalPath)) fs.unlinkSync(finalPath);
        if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
        res.redirect(`/admin/upload?error=${encodeURIComponent('Upload failed: ' + err.message)}`);
    } finally {
        if (conn) conn.release();
    }
});

module.exports = router;

