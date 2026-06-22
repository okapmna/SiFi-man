# OTA Firmware Updater — Improvement Roadmap

Daftar temuan dan rekomendasi perbaikan berdasarkan hasil brainstorming, dikelompokkan per area.

---

## 1. 🧪 Testing (Paling Kritis)

| Item | Keterangan |
|------|-----------|
| **Unit tests (Jest)** | Routes, middleware, database queries |
| **Integration tests** | End-to-end OTA flow (upload → check → download) |
| **Test fixtures** | Firmware `.bin` sample, mock DB |
| **Coverage threshold** | Minimum 80% coverage |

---

## 2. 🔒 Security Hardening

| Item | Keterangan |
|------|-----------|
| **Ganti MD5 → SHA256** | MD5 sudah tidak aman untuk integritas file |
| **Firmware signing** | Tanda tangan digital (ECDSA/Ed25519) agar ESP32 bisa verifikasi sumber firmware |
| **API key rotation / JWT** | Static API key saat ini hardcoded di env, tidak ada expiry |
| **Rate limit OTA endpoints** | `/api/ota/check` & `/download` tidak di-rate-limit → rawan abuse |
| **CSRF protection** | Admin forms menggunakan session tapi tanpa CSRF token |
| **Validasi input terpusat** | Gunakan **Joi** / **Zod** / **express-validator** |
| **HTTPS redirect** | Tambahkan middleware redirect HTTP→HTTPS di production |
| **Brute-force protection** | Rate limit di login sudah ada, tapi perlu juga di upload API |
| **Session store → MariaDB** | Konsisten: pindah dari SQLite ke MariaDB untuk session |

---

## 3. 📦 Firmware Management

| Item | Keterangan |
|------|-----------|
| **Semantic versioning** | Implementasi `semver` comparison, bukan string biasa |
| **Rollback protection** | Cegah device update ke versi lebih rendah (anti-downgrade) |
| **Chunked download** | Dukungan `Accept-Ranges` / partial content untuk firmware besar |
| **Delta updates** | Opsional: hanya kirim perbedaan (diff) antar versi |
| **Firmware manifest** | Metadata tambahan: chip target, min bootloader version, hash algoritma |

---

## 4. 📡 API Design

| Item | Keterangan |
|------|-----------|
| **API versioning** | `/api/v1/ota/check` untuk backward compatibility |
| **OpenAPI/Swagger** | Dokumentasi API otomatis (dengan **swagger-jsdoc**) |
| **Response format konsisten** | `{ success: bool, data: {}, error: {} }` di semua endpoint |
| **Pagination** | Untuk listing firmware (admin & public) |

---

## 5. 📊 Observability & Monitoring

| Item | Keterangan |
|------|-----------|
| **Structured logging** | Gunakan **pino** atau **winston** (JSON logs) |
| **Healthcheck endpoint** | `/api/health` perlu cek DB, disk storage, uptime |
| **Metrics** | Export Prometheus metrics (request count, latency, error rate) |
| **Graceful shutdown** | Tangkap `SIGTERM`/`SIGINT`, tutup koneksi DB dengan rapi |

---

## 6. 🛠️ Developer Experience & Code Quality

| Item | Keterangan |
|------|-----------|
| **ESLint + Prettier** | Linting & formatting otomatis (dengan `.eslintrc` + `.prettierrc`) |
| **EditorConfig** | `.editorconfig` untuk konsistensi antar editor |
| **Husky / lint-staged** | Pre-commit hooks (lint otomatis sebelum commit) |
| **TypeScript** | (Opsional) Migrasi gradual untuk type safety |

---

## 7. 🚀 CI/CD

| Item | Keterangan |
|------|-----------|
| **GitHub Actions** | Workflow: `lint → test → build → deploy` |
| **Docker image build** | Build & push image ke registry di setiap release |
| **Automated testing** | Jalankan test suite di setiap PR/push |

---

## 8. 🗄️ Database & Migrations

| Item | Keterangan |
|------|-----------|
| **Migration framework** | Gunakan **knex.js** atau **db-migrate** (bukan init.sql mentah) |
| **Unified session store** | Pindah session dari SQLite ke MariaDB |

---

## 9. 📝 Dokumentasi

| Item | Keterangan |
|------|-----------|
| **API docs** | Swagger UI interaktif |
| **Setup guide detail** | Tambahkan panduan kontribusi, arsitektur, flowchart OTA flow |

---

## Rekomendasi Prioritas (MVP)

Jika sumber daya terbatas, kerjakan dalam urutan ini:

1. **Testing** (Jest + integration tests) — foundational
2. **MD5 → SHA256 + firmware signing** — keamanan kritis
3. **Rate limiting OTA endpoints + CSRF** — hardening cepat
4. **CI/CD GitHub Actions** — automate quality
5. **Structured logging** — operability
6. **API versioning + response format konsisten** — maintainability jangka panjang
