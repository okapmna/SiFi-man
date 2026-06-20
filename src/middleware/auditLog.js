const pool = require('../config/database');

async function addLog({ action, entity_type, entity_id, details, ip_address, performed_by }) {
    let conn;
    try {
        conn = await pool.getConnection();
        await conn.query(
            `INSERT INTO audit_logs (action, entity_type, entity_id, details, ip_address, performed_by)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [action, entity_type || null, entity_id || null, details || null, ip_address || null, performed_by || null]
        );
    } catch (err) {
        console.error('Audit log error:', err);
    } finally {
        if (conn) conn.release();
    }
}

async function getLogs({ action, entity_type, page = 1, limit = 50 }) {
    let conn;
    try {
        conn = await pool.getConnection();

        const conditions = [];
        const params = [];

        if (action) {
            conditions.push('action LIKE ?');
            params.push(action + '%');
        }
        if (entity_type) {
            conditions.push('entity_type = ?');
            params.push(entity_type);
        }

        const where = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';
        const offset = (page - 1) * limit;

        const countRows = await conn.query(`SELECT COUNT(*) as total FROM audit_logs ${where}`, params);
        const total = Number(countRows[0].total);

        const rows = await conn.query(
            `SELECT * FROM audit_logs ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
            [...params, limit, offset]
        );

        return {
            logs: rows,
            total,
            page,
            totalPages: Math.ceil(total / limit)
        };
    } catch (err) {
        console.error('Get audit logs error:', err);
        return { logs: [], total: 0, page: 1, totalPages: 0 };
    } finally {
        if (conn) conn.release();
    }
}

module.exports = { addLog, getLogs };
