const mariadb = require('mariadb');
require('dotenv').config();

const pool = mariadb.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
    connectionLimit: 5,
    acquireTimeout: 20000
});

async function initializeDatabase() {
    let conn;
    try {
        conn = await pool.getConnection();

        await conn.query(`
            CREATE TABLE IF NOT EXISTS device_types (
                id INT AUTO_INCREMENT PRIMARY KEY,
                type_name VARCHAR(50) NOT NULL UNIQUE,
                description TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        await conn.query(`
            CREATE TABLE IF NOT EXISTS firmwares (
                id INT AUTO_INCREMENT PRIMARY KEY,
                version VARCHAR(50) NOT NULL,
                device_type_id INT NOT NULL,
                filename VARCHAR(255) NOT NULL,
                file_path VARCHAR(255) NOT NULL,
                checksum VARCHAR(64),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                CONSTRAINT fk_firmware_device_type 
                    FOREIGN KEY (device_type_id) 
                    REFERENCES device_types(id) 
                    ON DELETE RESTRICT ON UPDATE CASCADE
            )
        `);
        await conn.query(`
            CREATE TABLE IF NOT EXISTS admin_users (
                id INT AUTO_INCREMENT PRIMARY KEY,
                username VARCHAR(50) NOT NULL UNIQUE,
                password_hash VARCHAR(255) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Phase 3: Add new columns to firmwares (safe with IF NOT EXISTS)
        await conn.query(`ALTER TABLE firmwares ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT FALSE`);
        await conn.query(`ALTER TABLE firmwares ADD COLUMN IF NOT EXISTS file_size INT`);
        await conn.query(`ALTER TABLE firmwares ADD COLUMN IF NOT EXISTS notes TEXT`);

        // Phase 3: Auto-activate the latest firmware per device type if none are active (migration)
        await conn.query(`
            UPDATE firmwares f
            INNER JOIN (
                SELECT device_type_id, MAX(id) as max_id
                FROM firmwares
                GROUP BY device_type_id
                HAVING SUM(is_active) = 0
            ) latest ON f.device_type_id = latest.device_type_id AND f.id = latest.max_id
            SET f.is_active = TRUE
        `);

        // Create default admin if table is empty
        const admins = await conn.query("SELECT COUNT(*) as count FROM admin_users");
        // MariaDB returns BigInt for COUNT(*)
        const adminCount = Number(admins[0].count);
        if (adminCount === 0) {
            const bcrypt = require('bcryptjs');
            const salt = await bcrypt.genSalt(10);
            const hash = await bcrypt.hash('admin123', salt);
            await conn.query(
                "INSERT INTO admin_users (username, password_hash) VALUES (?, ?)",
                ['admin', hash]
            );
            console.log('Default admin created (admin / admin123)');
        }

        console.log('Database initialized successfully');
    } catch (err) {
        console.error('Error initializing database:', err);
    } finally {
        if (conn) conn.release();
    }
}

// Run initialization
initializeDatabase();

module.exports = pool;
