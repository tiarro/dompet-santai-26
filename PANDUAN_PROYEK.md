# Panduan Struktur dan Penggunaan Dompet Santai

Dokumen ini menjelaskan struktur proyek, penyimpanan cloud, migrasi data lama, PWA, dan alur kerja pengembangan Dompet Santai.

## Teknologi

- Nuxt 4 dan Vue 3 untuk aplikasi.
- TypeScript untuk kontrak dan logika.
- Supabase Auth, PostgreSQL, RPC, Row Level Security, dan Storage untuk backend.
- Vite PWA untuk aplikasi yang dapat dipasang.
- Vitest untuk unit test dan Playwright untuk E2E.

## Struktur proyek

- app: halaman, komponen, composable, utilitas, dan aset UI.
- server: endpoint Nitro yang memerlukan pemeriksaan server atau secret.
- shared/types/database.ts: kontrak tabel dan fungsi Supabase.
- supabase/migrations: migrasi SQL yang dijalankan pada proyek Supabase.
- public: aset statis, ikon PWA, dan halaman offline.
- test/unit dan test/e2e: pengujian logika dan alur browser.
- nuxt.config.ts: konfigurasi Nuxt, Supabase, dan PWA.

Direktori .nuxt, .output, node_modules, dan test-results dibuat otomatis dan tidak disimpan sebagai kode sumber.

## Persiapan lokal

Jalankan dari folder proyek:

    Copy-Item .env.example .env
    npm install
    npm run dev

Isi URL dan publishable key Supabase pada .env:

    NUXT_PUBLIC_SUPABASE_URL=https://nama-proyek.supabase.co
    NUXT_PUBLIC_SUPABASE_KEY=publishable-or-anon-key-anda

SUPABASE_URL dan SUPABASE_PUBLISHABLE_KEY juga didukung. Variabel NUXT_PUBLIC_* boleh dibaca browser. SUPABASE_SECRET_KEY hanya untuk server dan tidak boleh memakai awalan NUXT_PUBLIC_.

## Menyiapkan Supabase

Jalankan migrasi berikut secara berurutan di SQL Editor Supabase atau melalui workflow migrasi proyek:

1. supabase/migrations/20260810000000_create_transactions.sql adalah skema prototipe lama.
2. supabase/migrations/20261008000000_create_finance_cloud_storage.sql membuat profil, pengaturan, dompet, kategori, transaksi, anggaran, target tabungan, perpindahan tabungan, penanda migrasi, RLS, dan RPC snapshot.
3. supabase/migrations/20261008000001_create_receipts_storage.sql membuat bucket receipts privat dan policy Storage berdasarkan folder ID pengguna.

Migrasi keuangan menggunakan auth.uid() sebagai pemilik. Tabel keuangan diberikan kepada role authenticated dan setiap operasi dibatasi policy per pengguna. Fungsi get_finance_snapshot dan replace_finance_snapshot hanya dapat dipanggil role authenticated. Jangan mengganti policy dengan using true.

Jika proyek sudah pernah menjalankan migrasi lama, migrasi keuangan memindahkan tabel transactions lama menjadi transactions_legacy dan mencabut akses kliennya. Aplikasi memakai kontrak transaksi baru yang memiliki user_id, kategori, dompet, tanggal, dan path struk.

## Sumber data aplikasi

useCloudFinance() adalah sumber data utama. Data yang dikelola bersama dalam Supabase:

- profil dan status onboarding;
- tema, pengingat, saldo awal, dan dompet;
- kategori tambahan;
- pemasukan dan pengeluaran;
- anggaran bulanan;
- target serta perpindahan tabungan;
- metadata struk, sementara isi foto berada di Storage privat.

Aplikasi memuat ulang snapshot setelah navigasi atau ketika jendela kembali fokus. Tidak ada Realtime subscription. Saldo dan riwayat resmi menunggu RPC berhasil. Catatan baru saat offline disimpan di antrean IndexedDB per akun dan ditampilkan terpisah dengan status Menunggu sinkronisasi. Snapshot keuangan tidak disimpan dalam cache service worker.

## Migrasi localStorage lama

Data localStorage dari versi sebelumnya tetap dibaca sebagai sumber migrasi. Buka Pengaturan, lihat jumlah catatan, struk, anggaran, kategori, target, dan perpindahan, lalu pilih Migrasikan Data Browser. Migrasi membutuhkan koneksi internet, menyimpan snapshot melalui RPC, mencatat fingerprint pada finance_migrations, dan tidak menghapus data browser lama.

Migrasi dapat diulang. Jika data browser rusak, kartu migrasi menampilkan error dan tidak menimpa data cloud. Setelah migrasi, cloud menjadi sumber utama dan data browser lama hanya menjadi cadangan.

## Backup, restore, dan reset

Backup JSON dibuat dari snapshot cloud dan tidak berisi password, token, cookie, atau secret key. Restore menampilkan preview dan menolak penggantian jika fingerprint data berubah setelah preview. Reset mengosongkan data keuangan akun aktif melalui RPC; akun dan sesi Auth tetap dipertahankan.

Foto struk diunggah sebagai JPEG ke bucket receipts dengan path berawalan ID pengguna. Policy Storage membatasi select, insert, update, dan delete ke folder pemilik. Jangan membuat bucket receipts menjadi public.

## PWA online-first

Aplikasi dikonfigurasi dengan @vite-pwa/nuxt. Build produksi menghasilkan service worker, manifest, ikon public/pwa.svg, dan fallback public/offline.html. Aset aplikasi dapat diprecache agar shell dapat dibuka saat koneksi terputus.

Data Supabase tidak dicache. Saat aplikasi sudah terbuka dan data akun tersedia, penambahan transaksi offline masuk ke antrean IndexedDB. Sinkronisasi saat aplikasi aktif memeriksa kembali saldo/anggaran, mempertahankan transaksi yang gagal, dan mencegah duplikasi dengan UUID tetap serta fingerprint snapshot. Membuka ulang aplikasi sepenuhnya offline dan Background Sync belum didukung. Detail ada di docs/offline-transactions.md. Instalasi PWA perlu diuji pada build produksi.

## Menjalankan dan menguji

    npm run test:unit
    npm run build
    npm run test:e2e

E2E yang memakai Auth tiruan tidak mengubah database Supabase nyata. Pengujian cloud nyata memerlukan dua akun uji dan harus memeriksa RLS, Storage, RPC snapshot, migrasi, reset, restore, serta visibilitas data lintas perangkat.

Untuk pengujian dari HP di jaringan lokal:

    npm run dev -- --host 0.0.0.0

Buka URL LAN yang ditampilkan Nuxt dari HP. Kamera browser dan beberapa fitur PWA dapat memerlukan HTTPS atau localhost; HTTP melalui IP LAN tidak memenuhi secure context untuk kamera.

## Alur perubahan

1. Perbarui tipe bersama jika kontrak Supabase berubah.
2. Tulis migrasi baru untuk perubahan database, RLS, Storage, atau RPC.
3. Perbarui useCloudFinance dan utilitas terkait.
4. Tambahkan unit test untuk aturan data dan E2E untuk alur pengguna.
5. Jalankan unit test, type check Nuxt bila tersedia, build, dan E2E yang relevan.
6. Tinjau SQL untuk ownership, grant, policy, dan penghapusan data stale sebelum diterapkan ke proyek Supabase.
