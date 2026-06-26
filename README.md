# SiFi-man

Simple firmware management system for OTA update with admin dashboard.

## Features
- Admin dashboard with session-based authentication
- Firmware upload & version management per device type
- Active firmware tracking per device type
- OTA check & download endpoints for ESP32 / embedded devices
- **Self-contained MariaDB** — no dependency on external databases


## Setup Instructions

### Option 1: Running with Docker (Recommended)

This is the easiest way. A dedicated MariaDB container is included.

1. Copy and configure the environment file:
   ```bash
   cp .env.example .env
   # Edit .env — set strong passwords for DB_PASS, DB_ROOT_PASS, SESSION_SECRET
   ```

2. Start all services (app + database):
   ```bash
   docker compose up -d
   ```

3. View logs:
   ```bash
   docker compose logs -f
   ```

4. Stop services:
   ```bash
   docker compose down
   # To also remove the database volume (destroys all data):
   docker compose down -v
   ```

### Option 2: Running Locally (Dev)

Requires a local MariaDB/MySQL instance.

1. Copy and configure the environment file:
   ```bash
   cp .env.example .env
   # Set DB_HOST=localhost and your local credentials
   ```

2. Create the database manually:
   ```sql
   CREATE DATABASE ota_firmware_db;
   CREATE USER 'ota_user'@'localhost' IDENTIFIED BY 'your_password';
   GRANT ALL PRIVILEGES ON ota_firmware_db.* TO 'ota_user'@'localhost';
   ```

3. Install dependencies and start:
   ```bash
   npm install
   npm run dev
   ```

## Environment Variables

| Variable              | Description                          | Example               |
|-----------------------|--------------------------------------|-----------------------|
| `PORT`                | App port                             | `3000`                |
| `DB_HOST`             | MariaDB host (use `ota_db` in Docker)| `ota_db`              |
| `DB_USER`             | Database user                        | `ota_user`            |
| `DB_PASS`             | Database user password               | `strong_password`     |
| `DB_ROOT_PASS`        | MariaDB root password (Docker only)  | `root_secret`         |
| `DB_NAME`             | Database name                        | `ota_firmware_db`     |
| `SESSION_SECRET`      | Express session secret               | `random_string`       |
| `GITHUB_WEBHOOK_SECRET` | Webhook HMAC secret               | `webhook_secret`      |

## API Endpoints

| Method | Endpoint                      | Description                       |
|--------|-------------------------------|-----------------------------------|
| GET    | `/admin`                      | Admin dashboard                   |
| POST   | `/admin/login`                | Admin login                       |
| GET    | `/admin/firmwares`            | Firmware management               |
| POST   | `/admin/upload`               | Upload new firmware               |
| GET    | `/api/ota/check`              | OTA check (device → latest fw)    |
| GET    | `/api/ota/download/:filename` | Firmware binary download          |

## Default Admin Credentials

On first startup, a default admin account is created automatically:
- **Username:** `admin`
- **Password:** `admin123`

> Change the default password immediately after first login!
