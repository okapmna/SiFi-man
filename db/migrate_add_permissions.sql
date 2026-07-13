-- ============================================================
-- Migration: Add per-user permissions JSON column to admin_users
-- Run ONCE on an existing database. Safe to run multiple times.
-- ============================================================

USE ota_firmware_db;

-- Add permissions column if it doesn't exist
ALTER TABLE admin_users
    ADD COLUMN IF NOT EXISTS permissions JSON NOT NULL
        DEFAULT ('{"upload":true,"activate":true,"remove":true,"edit_detail":true,"edit_user":false}')
        COMMENT 'Per-user action permissions for admin panel';

-- Give the existing admin user full permissions (including edit_user)
UPDATE admin_users
   SET permissions = '{"upload":true,"activate":true,"remove":true,"edit_detail":true,"edit_user":true}'
 WHERE username = 'admin' AND (permissions IS NULL OR JSON_EXTRACT(permissions, '$.edit_user') = false);

SELECT 'Migration complete: permissions column added to admin_users' AS status;
