# Dompet Santai

Aplikasi pencatatan keuangan yang dibangun dengan Nuxt 4, TypeScript, Supabase, Vitest, dan Playwright.

## Menjalankan proyek

```powershell
Copy-Item .env.example .env
npm install
npm run dev
```

Isi `NUXT_PUBLIC_SUPABASE_URL` dan `NUXT_PUBLIC_SUPABASE_KEY` pada `.env` dengan kredensial proyek Supabase Anda. Nilai placeholder pada konfigurasi hanya memungkinkan aplikasi dan test berjalan sebelum kredensial tersedia; jangan gunakan untuk data produksi.

## Database

Jalankan migrasi [supabase/migrations/20260810000000_create_transactions.sql](supabase/migrations/20260810000000_create_transactions.sql) pada proyek Supabase. Akses tabel berada di composable `app/composables/useTransactions.ts`, dan tipe database ada di `shared/types/database.ts`.

## Test

```powershell
npm run test:unit
npm run test:e2e
```

Struktur proyek mengikuti [Nuxt Directory Structure](https://nuxt.com/docs/4.x/directory-structure): kode UI berada dalam `app/`, API Nitro dalam `server/`, kontrak bersama dalam `shared/`, dan test dalam `test/`.
