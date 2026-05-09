const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const pool = require('../config/database');
const sessionAuth = require('../middleware/sessionAuth');

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

module.exports = router;
