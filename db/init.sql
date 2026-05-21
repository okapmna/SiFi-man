-- ============================================================
-- OTA Firmware Updater - Database Initialization Script
-- Auto-executed by MariaDB on first container start
-- ============================================================

SET NAMES utf8mb4;
SET time_zone = '+00:00';

-- ------------------------------------------------------------
-- Table: device_types
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS device_types (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    type_name   VARCHAR(50)  NOT NULL UNIQUE,
    description TEXT,
    created_at  TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- Table: firmwares
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS firmwares (
    id             INT AUTO_INCREMENT PRIMARY KEY,
    version        VARCHAR(50)  NOT NULL,
    device_type_id INT          NOT NULL,
    filename       VARCHAR(255) NOT NULL,
    file_path      VARCHAR(255) NOT NULL,
    checksum       VARCHAR(64),
    is_active      BOOLEAN      NOT NULL DEFAULT FALSE,
    file_size      INT,
    notes          TEXT,
    created_at     TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_firmware_device_type
        FOREIGN KEY (device_type_id)
        REFERENCES device_types(id)
        ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- Table: admin_users
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS admin_users (
    id            INT AUTO_INCREMENT PRIMARY KEY,
    username      VARCHAR(50)  NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    created_at    TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- Seed: Default admin user
-- Username : admin
-- Password : admin123  (bcrypt cost=10)
-- Untuk ganti password, generate hash baru:
--   node -e "const b=require('bcryptjs');b.hash('PASSWORD_BARU',10).then(console.log)"
-- lalu UPDATE admin_users SET password_hash='HASH_BARU' WHERE username='admin';
-- ------------------------------------------------------------
INSERT IGNORE INTO admin_users (username, password_hash)
VALUES (
    'admin',
    '$2b$10$pjKrNHAtdTtLJNQvqrqe/.qKf8/Qg/4jkFD8K/CmBT4a3nrJr.FEi'
);
