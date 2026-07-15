const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const pool = require('../config/database');
const sessionAuth = require('../middleware/sessionAuth');
const permissionCheck = require('../middleware/permissionCheck');
const { addLog, getLogs } = require('../middleware/auditLog');
const { getStorage } = require('../services/storage');
const supabase = require('../config/supabase');

const storage = getStorage();

// Helper: robust is_active conversion (handles boolean, number, string, Buffer)
function isActive(val) {
    if (Buffer.isBuffer(val)) return val[0] === 1;
    return Number(val) === 1;
}

// ==========================================
// MULTER SETUP FOR ADMIN UPLOAD
// ==========================================
const tempDir = path.join(__dirname, '../../firmware_storage/temp');
if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

const upload = multer({
    dest: tempDir,
    fileFilter: (req, file, cb) => {
        if (path.extname(file.originalname) !== '.bin') {
            return cb(new Error('Only .bin files are allowed'));
        }
        cb(null, true);
    }
});

// Rate limiter for login
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: 'Too many login attempts. Please try again in 15 minutes.',
    standardHeaders: true,
    legacyHeaders: false
});

// GET /admin/login - Halaman form login
router.get('/login', (req, res) => {
    if (req.session && req.session.adminId) {
        return res.redirect('/admin/dashboard');
    }
    const error = req.session.error;
    req.session.error = null;
    res.render('login', { error });
});

// POST /admin/login - Proses login (with rate limiting)
router.post('/login', loginLimiter, async (req, res) => {
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
                req.session.permissions = typeof admin.permissions === 'string' ? JSON.parse(admin.permissions) : (admin.permissions || {});
                await addLog({ action: 'login', details: 'Login successful', ip_address: req.ip, performed_by: username });
                return res.redirect('/admin/dashboard');
            }
        }

        await addLog({ action: 'login_failed', details: `Failed login attempt for: ${username}`, ip_address: req.ip, performed_by: username || 'unknown' });
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

// POST /admin/logout
router.post('/logout', async (req, res) => {
    const username = req.session.username;
    const adminId = req.session.adminId;
    const ip = req.ip;
    req.session.destroy(async (err) => {
        if (err) {
            console.error('Logout error:', err);
        }
        await addLog({ action: 'logout', performed_by: username, ip_address: ip });
        res.redirect('/admin/login');
    });
});

// ==========================================
// PROTECTED ROUTES
// ==========================================
router.use(sessionAuth);

// GET /admin — redirect to dashboard
router.get('/', (req, res) => {
    res.redirect('/admin/dashboard');
});

// GET /admin/settings - Halaman pengaturan akun
router.get('/settings', async (req, res) => {
    const success = req.session.success;
    const error = req.session.error;
    req.session.success = null;
    req.session.error = null;

    let conn;
    let adminInfo = null;
    let allUsers = [];
    try {
        conn = await pool.getConnection();
        const rows = await conn.query(
            'SELECT id, username, created_at, permissions FROM admin_users WHERE id = ?',
            [req.session.adminId]
        );
        if (rows.length > 0) {
            adminInfo = rows[0];
            adminInfo.permissions = typeof adminInfo.permissions === 'string' ? JSON.parse(adminInfo.permissions) : (adminInfo.permissions || {});
            req.session.permissions = adminInfo.permissions;
        }

        if (req.session.permissions && req.session.permissions.edit_user) {
            const usersRows = await conn.query('SELECT id, username, permissions, created_at FROM admin_users ORDER BY id ASC');
            allUsers = usersRows.map(u => ({
                ...u,
                permissions: typeof u.permissions === 'string' ? JSON.parse(u.permissions) : (u.permissions || {})
            }));
        }
    } catch (err) {
        console.error('Settings error:', err);
    } finally {
        if (conn) conn.release();
    }

    res.render('admin/settings', {
        username: req.session.username,
        activePage: 'settings',
        adminInfo,
        allUsers,
        permissions: req.session.permissions || {},
        success,
        error
    });
});

// ==========================================
// USER MANAGER API
// ==========================================

// Add User
router.post('/settings/users', permissionCheck('edit_user'), async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ success: false, error: 'Username and password required' });

    let conn;
    try {
        conn = await pool.getConnection();
        const existing = await conn.query('SELECT id FROM admin_users WHERE username = ?', [username]);
        if (existing.length > 0) return res.status(400).json({ success: false, error: 'Username already exists' });

        const hash = await bcrypt.hash(password, 10);
        const defaultPerms = JSON.stringify({ upload: true, activate: true, remove: true, edit_detail: true, edit_user: false });
        
        await conn.query('INSERT INTO admin_users (username, password_hash, permissions) VALUES (?, ?, ?)', [username, hash, defaultPerms]);
        await addLog({ action: 'create_user', details: `Created user ${username}`, ip_address: req.ip, performed_by: req.session.username });
        
        res.json({ success: true });
    } catch (err) {
        console.error('Add user error:', err);
        res.status(500).json({ success: false, error: 'Database error' });
    } finally {
        if (conn) conn.release();
    }
});

// Edit Username
router.put('/settings/users/:id/username', permissionCheck('edit_user'), async (req, res) => {
    const { id } = req.params;
    const { username } = req.body;
    if (!username) return res.status(400).json({ success: false, error: 'Username required' });

    let conn;
    try {
        conn = await pool.getConnection();
        const existing = await conn.query('SELECT id FROM admin_users WHERE username = ? AND id != ?', [username, id]);
        if (existing.length > 0) return res.status(400).json({ success: false, error: 'Username already taken' });

        await conn.query('UPDATE admin_users SET username = ? WHERE id = ?', [username, id]);
        await addLog({ action: 'update_user', details: `Updated username for user ID ${id} to ${username}`, ip_address: req.ip, performed_by: req.session.username });
        
        res.json({ success: true });
    } catch (err) {
        console.error('Update username error:', err);
        res.status(500).json({ success: false, error: 'Database error' });
    } finally {
        if (conn) conn.release();
    }
});

// Edit Permissions
router.put('/settings/users/:id/permissions', permissionCheck('edit_user'), async (req, res) => {
    const { id } = req.params;
    const { permissions } = req.body;
    
    // Prevent self-editing permissions
    if (Number(id) === Number(req.session.adminId)) {
        return res.status(403).json({ success: false, error: 'You cannot edit your own permissions' });
    }

    let conn;
    try {
        conn = await pool.getConnection();
        await conn.query('UPDATE admin_users SET permissions = ? WHERE id = ?', [JSON.stringify(permissions), id]);
        await addLog({ action: 'update_permissions', details: `Updated permissions for user ID ${id}`, ip_address: req.ip, performed_by: req.session.username });
        
        res.json({ success: true });
    } catch (err) {
        console.error('Update permissions error:', err);
        res.status(500).json({ success: false, error: 'Database error' });
    } finally {
        if (conn) conn.release();
    }
});

// Delete User
router.delete('/settings/users/:id', permissionCheck('edit_user'), async (req, res) => {
    const { id } = req.params;

    // Prevent self-deletion
    if (Number(id) === Number(req.session.adminId)) {
        return res.status(403).json({ success: false, error: 'You cannot delete yourself' });
    }

    let conn;
    try {
        conn = await pool.getConnection();
        
        const user = await conn.query('SELECT username FROM admin_users WHERE id = ?', [id]);
        if (user.length === 0) return res.status(404).json({ success: false, error: 'User not found' });
        
        await conn.query('DELETE FROM admin_users WHERE id = ?', [id]);
        await addLog({ action: 'delete_user', details: `Deleted user ${user[0].username}`, ip_address: req.ip, performed_by: req.session.username });
        
        res.json({ success: true });
    } catch (err) {
        console.error('Delete user error:', err);
        res.status(500).json({ success: false, error: 'Database error' });
    } finally {
        if (conn) conn.release();
    }
});

// POST /admin/settings/password - Proses ganti password
const changePasswordLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    message: 'Too many password change attempts. Please try again in 15 minutes.',
    standardHeaders: true,
    legacyHeaders: false
});

router.post('/settings/password', changePasswordLimiter, async (req, res) => {
    const { current_password, new_password, confirm_password } = req.body;
    const adminId = req.session.adminId;

    if (!current_password || !new_password || !confirm_password) {
        req.session.error = 'All fields are required';
        return res.redirect('/admin/settings');
    }

    if (new_password.length < 8) {
        req.session.error = 'New password must be at least 8 characters';
        return res.redirect('/admin/settings');
    }

    if (new_password !== confirm_password) {
        req.session.error = 'New password and confirmation do not match';
        return res.redirect('/admin/settings');
    }

    if (current_password === new_password) {
        req.session.error = 'New password must be different from current password';
        return res.redirect('/admin/settings');
    }

    let conn;
    try {
        conn = await pool.getConnection();
        const rows = await conn.query('SELECT id, password_hash FROM admin_users WHERE id = ?', [adminId]);

        if (rows.length === 0) {
            req.session.error = 'User not found';
            return res.redirect('/admin/settings');
        }

        const isMatch = await bcrypt.compare(current_password, rows[0].password_hash);
        if (!isMatch) {
            await addLog({ action: 'password_change_failed', performed_by: req.session.username, ip_address: req.ip });
            req.session.error = 'Current password is incorrect';
            return res.redirect('/admin/settings');
        }

        const newHash = await bcrypt.hash(new_password, 10);
        await conn.query('UPDATE admin_users SET password_hash = ? WHERE id = ?', [newHash, adminId]);
        await addLog({ action: 'password_changed', performed_by: req.session.username, ip_address: req.ip });

        req.session.destroy((err) => {
            if (err) {
                console.error('Session destroy error after password change:', err);
            }
            res.redirect('/admin/login');
        });
    } catch (error) {
        console.error('Change password error:', error);
        req.session.error = 'Internal server error';
        res.redirect('/admin/settings');
    } finally {
        if (conn) conn.release();
    }
});

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
            activePage: 'dashboard',
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
            SELECT dt.id, dt.type_name, dt.description, dt.webhook_secret, dt.created_at,
                   (SELECT COUNT(*) FROM firmwares f WHERE f.device_type_id = dt.id) as firmware_count
            FROM device_types dt
            ORDER BY dt.created_at DESC
        `);
        
        const formattedDevices = devices.map(d => ({
            ...d,
            firmware_count: Number(d.firmware_count)
        }));

        res.render('admin/devices', {
            username: req.session.username,
            activePage: 'devices',
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
        // Auto-generate a unique webhook_secret for every new device
        const webhookSecret = crypto.randomBytes(32).toString('hex');
        conn = await pool.getConnection();
        const result = await conn.query(
            "INSERT INTO device_types (type_name, description, webhook_secret) VALUES (?, ?, ?)",
            [type_name, description, webhookSecret]
        );
        await addLog({ action: 'device_created', entity_type: 'device_type', entity_id: Number(result.insertId), details: `Created device type: ${type_name}`, performed_by: req.session.username, ip_address: req.ip });
        res.redirect('/admin/devices');
    } catch (error) {
        console.error('Add device error:', error);
        res.status(500).send('Failed to add device. Maybe duplicate name?');
    } finally {
        if (conn) conn.release();
    }
});

// POST /admin/devices/:id/regenerate-secret — regenerate webhook secret
router.post('/devices/:id/regenerate-secret', async (req, res) => {
    let conn;
    try {
        const deviceId = req.params.id;
        const newSecret = crypto.randomBytes(32).toString('hex');
        conn = await pool.getConnection();
        const rows = await conn.query('SELECT type_name FROM device_types WHERE id = ?', [deviceId]);
        if (rows.length === 0) {
            return res.status(404).json({ error: 'Device not found' });
        }
        await conn.query('UPDATE device_types SET webhook_secret = ? WHERE id = ?', [newSecret, deviceId]);
        await addLog({ action: 'device_secret_regenerated', entity_type: 'device_type', entity_id: Number(deviceId), details: `Regenerated webhook secret for: ${rows[0].type_name}`, performed_by: req.session.username, ip_address: req.ip });
        res.json({ success: true, secret: newSecret });
    } catch (error) {
        console.error('Regenerate secret error:', error);
        res.status(500).json({ error: 'Failed to regenerate secret' });
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
        await addLog({ action: 'device_updated', entity_type: 'device_type', entity_id: Number(deviceId), details: `Updated device type ID ${deviceId}: ${type_name}`, performed_by: req.session.username, ip_address: req.ip });
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
        const deviceRows = await conn.query("SELECT type_name FROM device_types WHERE id = ?", [deviceId]);
        const firmwares = await conn.query("SELECT COUNT(*) as count FROM firmwares WHERE device_type_id = ?", [deviceId]);
        if (Number(firmwares[0].count) > 0) {
            return res.status(400).json({ error: 'Cannot delete device with existing firmwares' });
        }

        await conn.query("DELETE FROM device_types WHERE id = ?", [deviceId]);
        await addLog({ action: 'device_deleted', entity_type: 'device_type', entity_id: Number(deviceId), details: `Deleted device type ID ${deviceId}: ${deviceRows.length > 0 ? deviceRows[0].type_name : 'unknown'}`, performed_by: req.session.username, ip_address: req.ip });
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
            SELECT f.id, f.version, f.filename, f.file_path, f.file_size, f.checksum,
                   f.is_active, f.notes, f.uploaded_by, f.source_repo, f.created_at,
                   dt.type_name, dt.id as device_type_id
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
            if (!fileSize && f.file_path && storage.getLocalPath(f.file_path)) {
                try {
                    const stat = fs.statSync(f.file_path);
                    fileSize = stat.size;
                } catch (e) {
                    fileSize = null;
                }
            }
            return {
                ...f,
                id: Number(f.id),
                device_type_id: Number(f.device_type_id),
                is_active: isActive(f.is_active),
                file_size: fileSize
            };
        });

        res.render('admin/firmwares', {
            username: req.session.username,
            activePage: 'firmwares',
            firmwares: enriched,
            deviceTypes,
            deviceFilter,
            isSupabase: !!supabase,
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

        const rows = await conn.query('SELECT f.device_type_id, f.version, dt.type_name FROM firmwares f JOIN device_types dt ON f.device_type_id = dt.id WHERE f.id = ?', [firmwareId]);
        if (rows.length === 0) {
            return res.status(404).json({ error: 'Firmware not found' });
        }
        const { device_type_id: deviceTypeId, version, type_name } = rows[0];

        // Deactivate all firmwares for this device type, then activate target
        await conn.query('UPDATE firmwares SET is_active = FALSE WHERE device_type_id = ?', [deviceTypeId]);
        await conn.query('UPDATE firmwares SET is_active = TRUE WHERE id = ?', [firmwareId]);

        await addLog({ action: 'firmware_activated', entity_type: 'firmware', entity_id: Number(firmwareId), details: `Activated firmware ${version} for ${type_name}`, performed_by: req.session.username, ip_address: req.ip });
        res.json({ success: true });
    } catch (err) {
        console.error('Activate firmware error:', err);
        res.status(500).json({ error: 'Failed to activate firmware' });
    } finally {
        if (conn) conn.release();
    }
});

// POST /admin/firmwares/sync — sync local firmware files to Supabase
router.post('/firmwares/sync', async (req, res) => {
    if (!supabase) {
        return res.status(400).json({ error: 'Supabase not configured' });
    }

    let conn;
    const results = { success: [], skipped: [], failed: [] };
    try {
        conn = await pool.getConnection();
        const firmwares = await conn.query(
            'SELECT f.id, f.filename, f.file_path, f.version, dt.type_name FROM firmwares f JOIN device_types dt ON f.device_type_id = dt.id ORDER BY f.id'
        );

        for (const fw of firmwares) {
            const storagePath = `${fw.type_name}/${fw.filename}`;

            // Check if already in Supabase
            const { data: existing } = await supabase.storage
                .from(process.env.SUPABASE_BUCKET || 'firmwares')
                .list(fw.type_name, { search: fw.filename });

            if (existing && existing.length > 0) {
                results.skipped.push(storagePath);
                continue;
            }

            // Check local file
            const localPath = fw.file_path;
            if (!fs.existsSync(localPath)) {
                results.failed.push({ path: storagePath, reason: 'File lokal tidak ditemukan' });
                continue;
            }

            const fileBuffer = fs.readFileSync(localPath);
            const { error } = await supabase.storage
                .from(process.env.SUPABASE_BUCKET || 'firmwares')
                .upload(storagePath, fileBuffer, { contentType: 'application/octet-stream', upsert: false });

            if (error) {
                results.failed.push({ path: storagePath, reason: error.message });
            } else {
                results.success.push(storagePath);
            }
        }

        res.json(results);
    } catch (err) {
        console.error('Sync error:', err);
        res.status(500).json({ error: 'Sync failed: ' + err.message });
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

        const rows = await conn.query('SELECT f.file_path, f.is_active, f.version, dt.type_name FROM firmwares f JOIN device_types dt ON f.device_type_id = dt.id WHERE f.id = ?', [firmwareId]);
        if (rows.length === 0) {
            return res.status(404).json({ error: 'Firmware not found' });
        }

        if (isActive(rows[0].is_active)) {
            return res.status(400).json({ error: 'Cannot delete the active firmware. Please activate another firmware first.' });
        }

        const { file_path: filePath, version, type_name } = rows[0];

        // Remove file from storage first, then DB
        if (filePath) {
            await storage.delete(filePath);
        }

        await conn.query('DELETE FROM firmwares WHERE id = ?', [firmwareId]);
        await addLog({ action: 'firmware_deleted', entity_type: 'firmware', entity_id: Number(firmwareId), details: `Deleted firmware ${version} for ${type_name}`, performed_by: req.session.username, ip_address: req.ip });

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
            activePage: 'upload',
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

    const { version, device_type, notes, set_active, source_repo } = req.body;

    if (!version || !device_type) {
        if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
        return res.redirect('/admin/upload?error=Version+and+device+type+are+required');
    }

    let conn;
    let savedPath;
    try {
        conn = await pool.getConnection();

        const rows = await conn.query('SELECT id, type_name FROM device_types WHERE type_name = ?', [device_type]);
        if (rows.length === 0) {
            if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
            return res.redirect('/admin/upload?error=Device+type+not+found');
        }
        const deviceTypeId = rows[0].id;
        const trustedName = rows[0].type_name;

        const ext = path.extname(req.file.originalname);
        const finalFilename = `${trustedName}_${version}_${Date.now()}${ext}`;

        // Save file via storage service (local or Supabase)
        savedPath = await storage.save(req.file.path, trustedName, finalFilename);

        // Calculate SHA256 checksum and file size
        const localPath = storage.getLocalPath(savedPath) || req.file.path;
        const fileBuffer = fs.readFileSync(localPath);
        const checksum = crypto.createHash('sha256').update(fileBuffer).digest('hex');
        const fileSize = fileBuffer.length;

        const isActive = set_active === 'on' || set_active === '1' || set_active === 'true';

        // If marking active, deactivate siblings first
        if (isActive) {
            await conn.query('UPDATE firmwares SET is_active = FALSE WHERE device_type_id = ?', [deviceTypeId]);
        }

        await conn.query(
            'INSERT INTO firmwares (version, device_type_id, filename, file_path, checksum, file_size, notes, is_active, uploaded_by, source_repo) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [version, deviceTypeId, finalFilename, savedPath, checksum, fileSize, notes || null, isActive, req.session.username, source_repo || null]
        );

        await addLog({ action: isActive ? 'firmware_uploaded_active' : 'firmware_uploaded', entity_type: 'firmware', details: `Uploaded firmware ${version} for ${trustedName} (${finalFilename})`, performed_by: req.session.username, ip_address: req.ip });

        res.redirect('/admin/firmwares?success=Firmware+uploaded+successfully');
    } catch (err) {
        console.error('Admin upload error:', err);
        if (savedPath) await storage.delete(savedPath).catch(() => {});
        if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
        res.redirect('/admin/upload?error=Upload+failed');
    } finally {
        if (conn) conn.release();
    }
});

// ==========================================
// AUDIT LOGS
// ==========================================

// GET /admin/logs — view audit logs (paginated, filterable)
router.get('/logs', async (req, res) => {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const action = req.query.action || '';
    const entity_type = req.query.entity_type || '';

    const result = await getLogs({
        action: action || undefined,
        entity_type: entity_type || undefined,
        page,
        limit: 50
    });

    res.render('admin/logs', {
        username: req.session.username,
        activePage: 'logs',
        logs: result.logs,
        total: result.total,
        page: result.page,
        totalPages: result.totalPages,
        filterAction: action,
        filterEntity: entity_type
    });
});

module.exports = router;

