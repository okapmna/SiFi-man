require('dotenv').config();
const pool = require('../config/database');

/**
 * Per-device API key authentication middleware.
 *
 * Priority:
 *   1. Look up `device_type` from request body/query.
 *   2. Fetch the device's `webhook_secret` from DB.
 *   3. Compare with the `x-api-key` header.
 *   4. Fallback: if no device-specific secret is set, accept the
 *      global GITHUB_WEBHOOK_SECRET from .env (backward-compat).
 */
const authMiddleware = async (req, res, next) => {
    const apiKey = req.headers['x-api-key'] || req.headers['x-github-token'];

    if (!apiKey) {
        return res.status(401).json({
            status: 'error',
            message: 'Unauthorized: Missing API Key (x-api-key header required)'
        });
    }

    // device_type can come from multipart body or query string
    const deviceType = req.body?.device_type || req.query?.device_type;

    if (!deviceType) {
        // No device_type → fall back to global secret
        if (apiKey !== process.env.GITHUB_WEBHOOK_SECRET) {
            return res.status(401).json({
                status: 'error',
                message: 'Unauthorized: Invalid API Key'
            });
        }
        return next();
    }

    let conn;
    try {
        conn = await pool.getConnection();
        const rows = await conn.query(
            'SELECT webhook_secret FROM device_types WHERE type_name = ?',
            [deviceType]
        );

        if (rows.length === 0) {
            return res.status(400).json({
                status: 'error',
                message: `Device type '${deviceType}' not registered`
            });
        }

        const deviceSecret = rows[0].webhook_secret;

        // If device has its own secret, validate against it
        if (deviceSecret) {
            if (apiKey !== deviceSecret) {
                return res.status(401).json({
                    status: 'error',
                    message: 'Unauthorized: Invalid API Key for this device'
                });
            }
            return next();
        }

        // Fallback: device exists but has no per-device secret yet → use global
        if (apiKey !== process.env.GITHUB_WEBHOOK_SECRET) {
            return res.status(401).json({
                status: 'error',
                message: 'Unauthorized: Invalid API Key'
            });
        }
        return next();
    } catch (err) {
        console.error('Auth middleware DB error:', err);
        return res.status(500).json({
            status: 'error',
            message: 'Internal Server Error during authentication'
        });
    } finally {
        if (conn) conn.release();
    }
};

module.exports = authMiddleware;
