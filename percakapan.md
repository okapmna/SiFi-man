# Ringkasan Percakapan

## 1. Kenapa `views/` tidak ada di `public/`?

| Direktori | Isi | Cara Kerja |
|-----------|-----|------------|
| **`public/`** | CSS, JS, gambar | Dikirim **langsung** ke browser apa adanya (`express.static`) |
| **`views/`** | File `.ejs` (template) | Di-**render dulu** di server dengan data, baru dikirim ke browser |

> Kenapa tidak digabung? Karena file `.ejs` kalau ditaruh di `public/`, semua orang bisa lihat source code aslinya lewat URL. Padahal `.ejs` harus diproses server dulu (biar datanya dimasukin ke template).

---

## 2. Struktur Proyek & Fungsi Masing-masing

```
ota-firmware-updater/
│
├── src/                     ← Kode utama aplikasi
│   ├── app.js               ← Gerbang utama (entry point) Express.js
│   ├── config/
│   │   └── database.js      ← Koneksi ke MariaDB
│   ├── middleware/
│   │   ├── auth.js          ← Proteksi API pakai API Key
│   │   ├── sessionAuth.js   ← Proteksi halaman admin pakai session login
│   │   └── auditLog.js      ← Catat semua aktivitas ke database
│   ├── routes/
│   │   ├── view.js          ← Halaman publik (daftar firmware)
│   │   ├── admin.js         ← Semua halaman admin (dashboard, CRUD, dll)
│   │   ├── ota.js           ← Endpoint OTA untuk perangkat IoT
│   │   ├── upload.js        ← Endpoint upload firmware via API
│   │   └── index.js         ← Router utama yang nyambungin semua route
│   ├── views/               ← Template halaman (EJS — dirender server)
│   │   ├── index.ejs        ← Halaman publik
│   │   ├── login.ejs        ← Login admin
│   │   └── admin/           ← Halaman admin (dashboard, devices, firmwares, dll)
│   └── public/              ← File statis (dikirim langsung)
│       ├── css/             ← Stylesheet (style.css, admin.css)
│       └── js/              ← JavaScript (admin.js)
│
├── db/
│   ├── init.sql             ← Membuat tabel & data awal (seed admin)
│   └── backup.sh            ← Script backup database otomatis
│
├── firmware_storage/        ← Tempat file .bin firmware disimpan
│   ├── esp32-incubator/     ← Firmware untuk ESP32 Incubator
│   └── esp32-smartlamp/     ← Firmware untuk ESP32 Smartlamp
│
├── Dockerfile               ← Cara build image Docker
├── docker-compose.yml       ← Jalanin 3 container: app + db + adminer
├── .env.example             ← Contoh konfigurasi (isi settingan)
├── package.json             ← Daftar dependency Node.js
└── simulate_upload.js/.sh   ← Script untuk testing upload firmware
```

---

## 3. Alur Kerja Aplikasi

### 🔐 Admin Login & Upload
```
Admin buka /admin/login → isi username/password
  → server cek ke tabel admin_users (bcrypt)
  → bikin session → simpan di SQLite
  → redirect ke dashboard

Admin upload firmware (.bin)
  → file disimpan di firmware_storage/{tipe_device}/
  → data firmware dicatat ke tabel firmwares
  → aktivitas dicatat ke audit_logs
```

### 📡 Perangkat IoT Cek Update
```
ESP32 kirim request:
  GET /api/ota/check?device=esp32-incubator&version=1.0.5

Server:
  → cari firmware active terbaru di database
  → kalau beda versi → balikin "update_available" + link download
  → kalau sama → balikin "up_to_date"

ESP32 download firmware baru:
  GET /api/ota/download/esp32-incubator_v1.0.6.bin
```

### 🌐 Halaman Publik
```
User buka http://localhost:3000/
  → server query semua firmware dari database
  → render index.ejs
  → tampilin daftar firmware per device type
```

### 📊 Admin Dashboard
```
Admin buka /admin/dashboard
  → lihat statistik: total device, total firmware
  → lihat 10 upload terbaru
  → kelola device types (tambah/edit/hapus)
  → kelola firmware (activate/deactivate/hapus)
  → lihat audit log (siapa ngapain kapan)
  → ganti password
```

---

## 4. Database (4 Tabel)

| Tabel | Fungsi |
|-------|--------|
| **device_types** | Daftar tipe perangkat (ESP32 Incubator, Smartlamp) |
| **firmwares** | Data firmware (versi, file, checksum, status active) |
| **admin_users** | Akun admin (username, password bcrypt) |
| **audit_logs** | Catatan aktivitas (siapa, ngapain, kapan) |

---

## 5. Cara Jalanin Aplikasi

### Pakai Docker (yang paling gampang)
```bash
docker compose up --build
```
Nanti jalan:
- App di `http://localhost:3000`
- Adminer (DB web) di `http://localhost:8088`

### Manual (tanpa Docker)
```bash
npm install
npm run dev
```
Pastikan MariaDB sudah berjalan dan file `.env` sudah diisi.
