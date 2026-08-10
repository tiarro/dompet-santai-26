# Panduan Struktur dan Penggunaan Dompet Santai

Dokumen ini menjelaskan susunan proyek **Dompet Santai**, kegunaan setiap bagian, dan alur kerja yang disarankan saat mengembangkan aplikasi.

## Teknologi

- **Nuxt 4** sebagai framework aplikasi full-stack.
- **TypeScript** untuk penulisan kode yang bertipe.
- **Supabase** untuk PostgreSQL dan layanan backend.
- **Vitest** untuk pengujian unit.
- **Playwright** untuk pengujian end-to-end di browser.

## Struktur proyek

```text
dompet-santai/
├── app/                    # Kode aplikasi Vue/Nuxt di sisi pengguna
│   ├── assets/             # Aset yang diproses Vite, misalnya CSS atau gambar
│   ├── components/         # Komponen UI yang dapat dipakai ulang
│   ├── composables/        # Logika Vue yang dapat dipakai ulang
│   ├── layouts/            # Kerangka halaman bersama
│   ├── middleware/         # Pemeriksaan sebelum perpindahan halaman
│   ├── pages/              # Halaman dan route berbasis berkas
│   ├── plugins/            # Plugin aplikasi di sisi klien/server
│   ├── utils/              # Fungsi bantuan sisi aplikasi
│   ├── app.config.ts       # Konfigurasi reaktif aplikasi
│   ├── app.vue             # Komponen akar Nuxt
│   └── error.vue           # Halaman saat terjadi error
├── server/                 # Kode Nitro yang hanya berjalan di server
│   ├── api/                # Endpoint API, misalnya /api/health
│   ├── middleware/         # Middleware untuk request server
│   ├── plugins/            # Plugin Nitro
│   ├── routes/             # Route server non-API
│   └── utils/              # Fungsi bantuan khusus server
├── shared/                 # Kode/kontrak yang bisa dipakai app dan server
│   └── types/              # Tipe TypeScript bersama, termasuk tipe Supabase
├── supabase/
│   └── migrations/         # Riwayat perubahan skema database dalam SQL
├── test/
│   ├── unit/               # Test Vitest
│   └── e2e/                # Test Playwright
├── public/                 # Berkas statis tanpa pemrosesan build
├── content/                # Cadangan untuk Nuxt Content jika modulnya ditambahkan
├── layers/                 # Cadangan untuk Nuxt Layers
├── modules/                # Cadangan untuk modul Nuxt lokal
├── nuxt.config.ts          # Konfigurasi utama Nuxt dan Supabase
├── vitest.config.ts        # Konfigurasi Vitest
├── playwright.config.ts    # Konfigurasi Playwright
└── .env.example            # Contoh environment variable lokal
```

Direktori `.nuxt/`, `.output/`, `node_modules/`, dan `test-results/` dibuat otomatis. Jangan mengubah atau menyimpan hasil build tersebut sebagai kode sumber.

## Bagian penting yang sudah ada

| Lokasi | Fungsi |
| --- | --- |
| `app/pages/index.vue` | Halaman beranda `/` dan contoh dashboard awal. |
| `app/layouts/default.vue` | Layout standar yang membungkus seluruh halaman. |
| `app/composables/useTransactions.ts` | Akses tabel `transactions` melalui Supabase. |
| `app/utils/currency.ts` | Formatter angka ke format Rupiah. |
| `server/api/health.get.ts` | Endpoint pengecekan aplikasi: `GET /api/health`. |
| `shared/types/database.ts` | Kontrak TypeScript untuk tabel database. |
| `supabase/migrations/20260810000000_create_transactions.sql` | Membuat tabel transaksi dan mengaktifkan Row Level Security (RLS). |
| `test/unit/currency.test.ts` | Contoh unit test untuk formatter Rupiah. |
| `test/e2e/home.spec.ts` | Contoh E2E test untuk halaman beranda. |

## Persiapan pertama

Pastikan Node.js versi modern yang kompatibel dengan Nuxt 4 sudah terpasang, kemudian jalankan dari folder proyek:

```powershell
npm install
Copy-Item .env.example .env
```

Buka `.env`, lalu isi variabel berikut dari halaman **Connect** atau **API Keys** pada proyek Supabase Anda:

```dotenv
NUXT_PUBLIC_SUPABASE_URL=https://nama-proyek.supabase.co
NUXT_PUBLIC_SUPABASE_KEY=publishable-or-anon-key-anda
```

`NUXT_PUBLIC_SUPABASE_KEY` memang boleh dipakai oleh browser. Jangan pernah menaruh service role key dalam variabel `NUXT_PUBLIC_*` atau kode `app/`.

## Menyiapkan database Supabase

1. Buat proyek baru di Supabase.
2. Salin isi `supabase/migrations/20260810000000_create_transactions.sql` ke SQL Editor Supabase, lalu jalankan.
3. Perbarui `.env` dengan URL dan publishable/anon key proyek tersebut.
4. Buat kebijakan RLS sebelum aplikasi diizinkan membaca atau menulis data.

Migrasi saat ini sengaja hanya mengaktifkan RLS dan belum membuat policy. Dengan demikian akses dari klien akan ditolak sampai policy ditentukan. Contoh berikut hanya sesuai bila setiap pengguna yang terautentikasi memang boleh mengakses semua transaksi; untuk aplikasi nyata, batasi policy berdasarkan kolom pemilik seperti `user_id`.

```sql
create policy "Authenticated users can read transactions"
on public.transactions for select
to authenticated
using (true);

create policy "Authenticated users can add transactions"
on public.transactions for insert
to authenticated
with check (true);
```

Jika skema berubah, perbarui `shared/types/database.ts`. Bila memakai Supabase CLI, tipe dapat digenerasi ulang dengan pola berikut:

```powershell
npx supabase gen types typescript --project-id ID_PROYEK --schema public > shared/types/database.ts
```

## Menjalankan aplikasi

```powershell
npm run dev
```

Buka alamat yang ditampilkan terminal, biasanya `http://localhost:3000`. Untuk memeriksa endpoint server, buka `http://localhost:3000/api/health`; respons yang benar adalah `{"status":"ok"}`.

Untuk build produksi:

```powershell
npm run build
npm run preview
```

## Cara menambahkan fitur

1. Buat halaman baru di `app/pages/`. Contoh `app/pages/transaksi.vue` akan menjadi route `/transaksi`.
2. Letakkan tampilan yang dapat digunakan ulang di `app/components/`.
3. Letakkan logika klien yang dapat digunakan ulang di `app/composables/` atau `app/utils/`.
4. Gunakan `useTransactions()` dari `app/composables/useTransactions.ts` untuk membaca atau menambah transaksi. Tangani error Supabase di halaman pemanggil agar pengguna mendapat pesan yang jelas.
5. Untuk operasi yang membutuhkan rahasia atau validasi backend, buat endpoint di `server/api/`; jangan menaruh service role key di browser.
6. Tambahkan atau perbarui migrasi SQL, tipe database, dan test bersamaan dengan perubahan fitur.

## Menjalankan test

Jalankan unit test:

```powershell
npm run test:unit
```

Sebelum E2E test pertama kali, instal browser Chromium Playwright:

```powershell
npx playwright install chromium
npm run test:e2e
```

Playwright otomatis menyalakan server Nuxt sementara, membuka halaman beranda, lalu memeriksa judulnya. Pada Windows, proses dapat sesekali terlambat berhenti setelah semua test bertanda `ok`; lihat hasil assertion test sebelum menganggapnya gagal.

## Aturan pengembangan singkat

- Simpan rahasia hanya dalam `.env`; `.env` tidak boleh di-commit.
- Gunakan `shared/types/database.ts` agar data Supabase tetap bertipe.
- Pisahkan UI (`app/`), API server (`server/`), dan kontrak bersama (`shared/`).
- Tulis unit test untuk fungsi/logika kecil dan E2E test untuk alur pengguna.
- Jalankan minimal `npm run test:unit` dan `npm run build` sebelum mengirim perubahan.
