# SiFi-man API Endpoints

Daftar lengkap semua endpoint aplikasi **OTA Firmware Updater**.

---

## 🌐 Public View

Base path: `/`

| Method | Endpoint | Deskripsi |
|--------|----------|-----------|
| `GET` | `/` | Halaman publik daftar firmware, dikelompokkan berdasarkan tipe device |

---

## 🔐 Admin Panel

Base path: `/admin`

### Auth

| Method | Endpoint | Deskripsi |
|--------|----------|-----------|
| `GET` | `/admin/login` | Tampilkan form login admin |
| `POST` | `/admin/login` | Proses login (rate limit: 10x per 15 menit) |
| `POST` | `/admin/logout` | Hapus session dan redirect ke login |

### Dashboard

| Method | Endpoint | Deskripsi |
|--------|----------|-----------|
| `GET` | `/admin/` | Redirect ke `/admin/dashboard` |
| `GET` | `/admin/dashboard` | Dashboard utama: total device, total firmware, 10 upload terbaru |

### Settings & User Management

| Method | Endpoint | Deskripsi |
|--------|----------|-----------|
| `GET` | `/admin/settings` | Halaman settings akun dan daftar user (jika punya permission) |
| `POST` | `/admin/settings/users` | Buat user admin baru (butuh permission `edit_user`) |
| `PUT` | `/admin/settings/users/:id/username` | Ubah username user tertentu (butuh `edit_user`) |
| `PUT` | `/admin/settings/users/:id/permissions` | Ubah permission user (butuh `edit_user`, tidak bisa edit diri sendiri) |
| `DELETE` | `/admin/settings/users/:id` | Hapus user (butuh `edit_user`, tidak bisa hapus diri sendiri) |
| `POST` | `/admin/settings/password` | Ganti password sendiri (rate limit: 5x per 15 menit, session dihapus setelah sukses) |

### Device Management

| Method | Endpoint | Deskripsi |
|--------|----------|-----------|
| `GET` | `/admin/devices` | Daftar semua tipe device beserta jumlah firmware |
| `POST` | `/admin/devices` | Tambah tipe device baru (dilengkapi auto-generate webhook secret) |
| `POST` | `/admin/devices/:id/regenerate-secret` | Regenerasi webhook secret untuk device tertentu |
| `PUT` | `/admin/devices/:id` | Ubah nama dan deskripsi device |
| `DELETE` | `/admin/devices/:id` | Hapus device (hanya jika tidak memiliki firmware terkait) |

### Firmware Management

| Method | Endpoint | Deskripsi |
|--------|----------|-----------|
| `GET` | `/admin/firmwares` | Daftar semua firmware, bisa filter dengan `?device=` |
| `PATCH` | `/admin/firmwares/:id/activate` | Aktifkan firmware (akan menonaktifkan firmware lain untuk device yang sama) |
| `DELETE` | `/admin/firmwares/:id` | Hapus firmware beserta file-nya dari disk (tidak bisa hapus firmware aktif) |

### Upload

| Method | Endpoint | Deskripsi |
|--------|----------|-----------|
| `GET` | `/admin/upload` | Tampilkan form upload firmware dengan pilihan device type |
| `POST` | `/admin/upload` | Proses upload file `.bin`, simpan ke `firmware_storage/<device_type>/`, hitung SHA256, opsional langsung aktifkan |

### Audit Logs

| Method | Endpoint | Deskripsi |
|--------|----------|-----------|
| `GET` | `/admin/logs` | Lihat audit log (paginasi 50 per halaman, filter `?action=` & `?entity_type=`) |

---

## 🚀 REST API

Base path: `/api`

### Health

| Method | Endpoint | Deskripsi |
|--------|----------|-----------|
| `GET` | `/api/health` | Health check, response: `{ "status": "ok", "timestamp": "..." }` |

### Upload (via API)

| Method | Endpoint | Deskripsi |
|--------|----------|-----------|
| `POST` | `/api/upload` | Upload firmware via API. Membutuhkan header `x-api-key`. Menerima multipart form dengan field: `firmware` (.bin), `version`, `device_type`, `release_notes`, `uploaded_by`, `checksum`, `source_repo`. Validasi device type, verifikasi checksum (opsional), simpan file, return JSON 201. |

### OTA (Over-the-Air Update)

| Method | Endpoint | Deskripsi |
|--------|----------|-----------|
| `GET` | `/api/ota/check` | Cek ketersediaan update OTA. Parameter via query (`?version=&device=`) atau header (`x-esp32-version`, `x-esp32-device`). Response: `update_available` (sertakan `url` + `checksum`), `up_to_date`, atau `no_update`. URL yang dikembalikan bersifat relatif: `/ota/download/<filename>`. ESP32/klien harus menggabungkan dengan base API: `<base_url>/api + <url>`. Rate limit: 60x per 15 menit. |
| `GET` | `/api/ota/download/:filename` | Download file firmware berdasarkan nama file. Dipanggil otomatis oleh ESP32 setelah menerima URL dari endpoint check. Rate limit: 10x per 15 menit. |

---

## Ringkasan

| Grup | Jumlah Endpoint |
|------|:---------------:|
| Public View | 1 |
| Admin Panel | 22 |
| REST API | 4 |
| **Total** | **27** |

## Struktur Mounting

```
app.use('/',       viewRoutes)   → src/routes/view.js
app.use('/admin',  adminRoutes)  → src/routes/admin.js
app.use('/api',    routes)       → src/routes/index.js
  ├── /api/upload               → src/routes/upload.js
  ├── /api/ota                  → src/routes/ota.js
  └── /api/health               → inline di index.js
```

## Middleware

| Middleware | File | Digunakan Pada |
|-----------|------|----------------|
| `sessionAuth` | `src/middleware/sessionAuth.js` | Semua route `/admin/*` (kecuali login) |
| `permissionCheck('edit_user')` | `src/middleware/permissionCheck.js` | CRUD user di `/admin/settings/users/*` |
| `auth` (API Key) | `src/middleware/auth.js` | `POST /api/upload` |
| `loginLimiter` | inline di `admin.js` | `POST /admin/login` (10 req/15min) |
| `changePasswordLimiter` | inline di `admin.js` | `POST /admin/settings/password` (5 req/15min) |
| `checkLimiter` | inline di `ota.js` | `GET /api/ota/check` (60 req/15min) |
| `downloadLimiter` | inline di `ota.js` | `GET /api/ota/download/:filename` (10 req/15min) |
