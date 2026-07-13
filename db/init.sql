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
    id             INT AUTO_INCREMENT PRIMARY KEY,
    type_name      VARCHAR(50)  NOT NULL UNIQUE,
    description    TEXT,
    webhook_secret VARCHAR(64)  DEFAULT NULL COMMENT 'Per-device API key for GitHub Actions upload',
    created_at     TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
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
    uploaded_by    VARCHAR(100) DEFAULT NULL,
    source_repo    VARCHAR(255) DEFAULT NULL,
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
    permissions   JSON         NOT NULL DEFAULT ('{"upload":true,"activate":true,"remove":true,"edit_detail":true,"edit_user":true}'),
    created_at    TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- Table: audit_logs
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_logs (
    id            INT AUTO_INCREMENT PRIMARY KEY,
    action        VARCHAR(100) NOT NULL,
    entity_type   VARCHAR(50),
    entity_id     INT,
    details       TEXT,
    ip_address    VARCHAR(45),
    performed_by  VARCHAR(100),
    created_at    TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- Grant privileges for ota_user from any host (for Adminer)
GRANT ALL PRIVILEGES ON ota_firmware_db.* TO 'ota_user'@'%' IDENTIFIED BY 'ota_password_app';
FLUSH PRIVILEGES;

-- Seed: Default admin user
-- Username : admin
-- Password : admin123  (bcrypt cost=10)
-- Untuk ganti password, generate hash baru:
--   node -e "const b=require('bcryptjs');b.hash('PASSWORD_BARU',10).then(console.log)"
-- lalu UPDATE admin_users SET password_hash='HASH_BARU' WHERE username='admin';
-- ------------------------------------------------------------
INSERT IGNORE INTO admin_users (username, password_hash, permissions)
VALUES (
    'admin',
    '$2b$10$pjKrNHAtdTtLJNQvqrqe/.qKf8/Qg/4jkFD8K/CmBT4a3nrJr.FEi',
    '{"upload":true,"activate":true,"remove":true,"edit_detail":true,"edit_user":true}'
);
