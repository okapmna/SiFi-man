const mariadb = require('mariadb');
require('dotenv').config();

// Schema & seed data diinisialisasi oleh db/init.sql
// yang di-mount MariaDB via docker-entrypoint-initdb.d
const pool = mariadb.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
    connectionLimit: 5,
    acquireTimeout: 20000
});

module.exports = pool;
