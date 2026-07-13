-- ============================================================
-- Migration: Add per-device webhook_secret to device_types
-- Run this script ONCE on an existing database.
-- Safe to run multiple times (uses IF NOT EXISTS pattern).
-- ============================================================

USE ota_firmware_db;

-- Add webhook_secret column if it doesn't exist yet
ALTER TABLE device_types
    ADD COLUMN IF NOT EXISTS webhook_secret VARCHAR(64) DEFAULT NULL
        COMMENT 'Per-device API key for GitHub Actions upload';

-- Done. Existing devices will have webhook_secret = NULL until:
--   - Admin regenerates it via /admin/devices/:id/regenerate-secret
--   - Or you run the UPDATE below to auto-generate UUIDs as placeholders
--
-- To bulk-generate random secrets for all existing devices, run:
-- UPDATE device_types
--    SET webhook_secret = SUBSTRING(SHA2(CONCAT(RAND(), type_name, NOW()), 256), 1, 64)
-- WHERE webhook_secret IS NULL;

SELECT 'Migration complete: webhook_secret column added to device_types' AS status;
