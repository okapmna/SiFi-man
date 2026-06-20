# OTA Firmware Updater — Improvement Roadmap

Daftar temuan dan rekomendasi perbaikan berdasarkan hasil brainstorming, dikelompokkan per area.

---

## 1. 🧪 Testing

| # | Item | Prioritas | Detail |
|---|------|-----------|--------|
| 1.1 | Unit tests (Jest) | 🔴 Tinggi | Routes, middleware, database queries |
| 1.2 | Integration tests | 🔴 Tinggi | End-to-end OTA flow: upload → check → download |
| 1.3 | Test fixtures | 🟡 Sedang | Firmware `.bin` sample, mock database, mock ESP32 request |
| 1.4 | Coverage threshold | 🟡 Sedang | Minimum 80% coverage via `--coverage` |

---

## 2. 🔒 Security Hardening

| # | Item | Prioritas | Detail |
|---|------|-----------|--------|
| 2.1 | MD5 → SHA256 | 🔴 Tinggi | Ganti algoritma checksum dari MD5 ke SHA256 |
| 2.2 | Firmware signing | 🔴 Tinggi | Tanda tangan digital (ECDSA/Ed25519) agar ESP32 bisa verifikasi otentisitas firmware |
| 2.3 | API key rotation / JWT | 🟡 Sedang | Static API key via env var → token berbasis waktu/per-device |
| 2.4 | Rate limit OTA endpoints | 🟡 Sedang | `/api/ota/check` & `/download` saat ini tidak di-rate-limit |
| 2.5 | CSRF protection | 🟡 Sedang | Admin forms pakai session tapi tanpa CSRF token |
| 2.6 | Validasi input terpusat | 🟡 Sedang | Gunakan Joi / Zod / express-validator di semua input |
| 2.7 | HTTPS redirect middleware | 🟢 Rendah | Redirect HTTP → HTTPS di production |
| 2.8 | Brute-force upload API | 🟡 Sedang | Rate limit untuk `POST /api/upload` |
| 2.9 | Session store → MariaDB | 🟢 Rendah | Pindah session dari SQLite ke MariaDB (konsisten) |
| 2.10 | Environment validation | 🟡 Sedang | Validasi semua env var wajib di startup |

---

## 3. 📦 Firmware Management

| # | Item | Prioritas | Detail |
|---|------|-----------|--------|
| 3.1 | Semantic versioning | 🔴 Tinggi | Implementasi `semver` untuk perbandingan versi (bukan string biasa) |
| 3.2 | Anti-downgrade / rollback protection | 🟡 Sedang | Cegah device update ke versi lebih rendah |
| 3.3 | Chunked download (Accept-Ranges) | 🟡 Sedang | Partial content support untuk firmware besar |
| 3.4 | Delta updates | 🟢 Rendah | Opsional: kirim diff antar versi untuk hemat bandwidth |
| 3.5 | Firmware manifest | 🟡 Sedang | Metadata tambahan: chip target, min bootloader, hash algorithm, build date |
| 3.6 | Firmware retention policy | 🟢 Rendah | Auto-cleanup firmware lama berdasarkan jumlah versi atau tanggal |

---

## 4. 📡 API Design

| # | Item | Prioritas | Detail |
|---|------|-----------|--------|
| 4.1 | API versioning | 🟡 Sedang | `/api/v1/ota/check` untuk backward compatibility |
| 4.2 | OpenAPI / Swagger | 🟡 Sedang | Dokumentasi API interaktif via `swagger-jsdoc` + `swagger-ui-express` |
| 4.3 | Response format konsisten | 🟡 Sedang | Format seragam: `{ success: bool, data: {}, error: {} }` |
| 4.4 | Pagination | 🟢 Rendah | Untuk listing firmware di admin & public view |
| 4.5 | Error code standar | 🟡 Sedang | Kode error terpusat: `ERR_DEVICE_NOT_FOUND`, `ERR_VERSION_EXISTS`, dll |

---

## 5. 📊 Observability & Monitoring

| # | Item | Prioritas | Detail |
|---|------|-----------|--------|
| 5.1 | Structured logging | 🟡 Sedang | Ganti morgan dengan pino / winston (JSON logs, level-based) |
| 5.2 | Enhanced healthcheck | 🟡 Sedang | Cek koneksi DB, disk storage availability, uptime |
| 5.3 | Prometheus metrics | 🟢 Rendah | Export request count, latency, error rate |
| 5.4 | Graceful shutdown | 🟡 Sedang | Tangkap `SIGTERM` / `SIGINT`, tutup DB pool & server dengan rapi |

---

## 6. 🛠️ Developer Experience & Code Quality

| # | Item | Prioritas | Detail |
|---|------|-----------|--------|
| 6.1 | ESLint + Prettier | 🟡 Sedang | Linting & formatting otomatis (`.eslintrc` + `.prettierrc`) |
| 6.2 | EditorConfig | 🟢 Rendah | `.editorconfig` untuk konsistensi indentasi & encoding |
| 6.3 | Husky + lint-staged | 🟢 Rendah | Pre-commit hooks: lint otomatis sebelum commit |
| 6.4 | TypeScript (gradual) | 🟢 Rendah | Migrasi bertahap untuk type safety |
| 6.5 | NPM scripts rapi | 🟢 Rendah | Standarisasi script: `lint`, `format`, `typecheck`, `test:watch` |

---

## 7. 🚀 CI/CD

| # | Item | Prioritas | Detail |
|---|------|-----------|--------|
| 7.1 | GitHub Actions — lint & test | 🔴 Tinggi | Workflow otomatis di setiap push/PR |
| 7.2 | Docker image build & push | 🟡 Sedang | Build image & push ke GHCR / Docker Hub di release |
| 7.3 | Automated deployment | 🟢 Rendah | Deploy otomatis ke staging/production |

---

## 8. 🗄️ Database & Migrations

| # | Item | Prioritas | Detail |
|---|------|-----------|--------|
| 8.1 | Migration framework | 🟡 Sedang | Gunakan `knex.js` atau `db-migrate` (bukan `init.sql` mentah) |
| 8.2 | Seeder | 🟢 Rendah | Seed data terstruktur untuk development |
| 8.3 | Unified session store | 🟢 Rendah | Pindah session dari SQLite ke MariaDB |

---

## 9. 📝 Dokumentasi

| # | Item | Prioritas | Detail |
|---|------|-----------|--------|
| 9.1 | Swagger UI | 🟡 Sedang | Dokumentasi API interaktif |
| 9.2 | Kontribusi & arsitektur | 🟢 Rendah | `CONTRIBUTING.md`, arsitektur, flowchart OTA flow |
| 9.3 | CHANGELOG | 🟢 Rendah | Riwayat perubahan per release |

---

## 10. 🐳 Docker & Deployment

| # | Item | Prioritas | Detail |
|---|------|-----------|--------|
| 10.1 | Healthcheck container | 🟡 Sedang | Tambahkan `healthcheck` di service `app` pada `docker-compose.yml` |
| 10.2 | Non-root user | 🟡 Sedang | Jalankan container dengan user non-root (best practice Docker) |
| 10.3 | Multi-stage build | 🟢 Rendah | Pisahkan stage dev & production di Dockerfile |
| 10.4 | Backup verification | 🟢 Rendah | Verifikasi hasil backup DB (saat ini backup script ada tapi notifikasi/verifikasi tidak) |

---

## Prioritas Eksekusi (MVP)

Fase 1 — **Foundation** (siklus 1):
```
1.1  Unit tests (Jest)
2.1  MD5 → SHA256
6.1  ESLint + Prettier
7.1  GitHub Actions lint & test
```

Fase 2 — **Security** (siklus 2):
```
2.2  Firmware signing
2.4  Rate limit OTA endpoints
2.5  CSRF protection
2.6  Validasi input terpusat
3.1  Semantic versioning
```

Fase 3 — **Reliability** (siklus 3):
```
1.2  Integration tests
3.2  Anti-downgrade
4.1  API versioning
4.3  Response format konsisten
5.1  Structured logging
```

Fase 4 — **Operations** (siklus 4):
```
5.2  Enhanced healthcheck
5.4  Graceful shutdown
8.1  Migration framework
10.1 Healthcheck container
10.2 Non-root user
```
