# Web Push pengingat mencatat

Pengingat harian adalah layanan opt-in per perangkat. Tombol di Pengaturan meminta izin browser hanya setelah diklik. Pengguna memilih jam melalui pengaturan pengingat yang sudah ada; server membaca pengaturan tersimpan, bukan isian yang belum disimpan. Zona waktu IANA berasal dari browser. Pengingat menabung tetap berada di dalam aplikasi.

## Penerapan

1. Terapkan `supabase/migrations/20261123050648_create_web_push_reminders.sql` di database proyek.
2. Jalankan `node scripts/prepare-web-push.mjs`. Skrip menyiapkan `.cache/web-push/secrets.env`, SQL Vault, dan sumber satu berkas untuk editor dashboard. Rahasia tidak dicetak. Simpan folder ini secara privat dan gunakan kembali kunci yang sama saat deploy ulang.
3. Tambahkan `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, dan `PUSH_CRON_SECRET` sebagai Edge Function Secrets. VAPID subject adalah URL kontak aplikasi; nilai awal menggunakan URL proyek. Jangan gunakan private key atau cron secret di browser atau konfigurasi publik Nuxt.
4. Deploy `daily-reminders` dengan `verify_jwt = false` sesuai `supabase/config.toml`. Handler selalu memverifikasi JWT pengguna memakai Auth `getUser`; aksi `dispatch` hanya menerima `x-cron-secret` yang sesuai. Melalui CLI, gunakan opsi target remote dan `--use-api` yang didukung versi CLI Anda; periksa `supabase functions deploy --help`. Editor dashboard dapat memakai `.cache/web-push/dashboard-index.ts`.
5. Jalankan `.cache/web-push/configure-vault.sql` tanpa mencetak atau menyertakannya dalam Git. SQL menyimpan URL proyek dan cron secret pada Vault, lalu jalankan `supabase/schedule-web-push.sql`. Jadwal bernama `dompet-santai-daily-reminders` memanggil worker setiap menit. Mengulangi SQL memperbarui jadwal yang sama.
6. Periksa `cron.job`, `cron.job_run_details`, hasil HTTP `net._http_response`, dan kirim notifikasi uji dari perangkat yang mengizinkan Web Push. HTTP 200 dengan `sent: 0` berarti worker berjalan, bukan bukti sebuah perangkat telah menerima notifikasi.

## Perilaku dan penyimpanan

`push_subscriptions` menyimpan endpoint, kunci enkripsi, zona waktu dan pemilik. RLS hanya memberi akun akses baca/hapus perangkatnya; tulis dilakukan handler setelah memverifikasi pengguna serta memvalidasi endpoint layanan push, kunci dan zona waktu. Langganan dibatasi 10 perangkat per akun. `push_deliveries` dan RPC klaim hanya dapat diakses worker service-role. Penjadwal tidak mengubah data keuangan.

Worker mengklaim maksimal 100 pengiriman per menit. Kunci unik perangkat/tanggal mencegah dua jadwal mengirim pengingat harian yang sama. Klaim bertahan lima menit; kegagalan sementara dicoba ulang maksimal tiga kali. Tepat sebelum mengirim, worker memeriksa kembali apakah pengingat masih aktif dan apakah catatan hari itu sudah ada. Respons 404/410 menghapus langganan kedaluwarsa. Riwayat operasional pengiriman dibersihkan setelah 35 hari. Bila proses berhenti setelah layanan push menerima pesan tetapi sebelum status tersimpan, pengiriman dapat terulang; tag per tanggal menyatukan notifikasi yang masih tampil.

Worker browser menyimpan pemilik di IndexedDB, hanya menampilkan pesan untuk akun perangkat saat ini, menolak payload kedaluwarsa, dan membuka `/?pengingat=catatan` saat diklik. Logout melepas subscription browser dan menutup notifikasi yang masih tampil. Langganan server yang tersisa akan dihapus ketika layanan push menyatakan endpoint kedaluwarsa. Perangkat lain tetap terdaftar. Hapus akun menghapus langganan dan riwayatnya secara berantai. Backup/restore/reset keuangan tidak membawa langganan perangkat; reset menonaktifkan pengingat melalui pengaturan awal.

## Batasan dan pengujian

Web Push tersedia pada secure context (HTTPS atau localhost), browser yang mendukung, dan setelah izin pengguna. Di iOS/iPadOS 16.4+, aplikasi perlu dipasang ke Layar Utama. Push bergantung pada jaringan, layanan push, dan kebijakan sistem; browser yang dihentikan paksa atau pembatasan daya dapat mencegah tampilnya pesan. Jam mengikuti zona waktu per perangkat yang diperbarui saat Pengaturan dibuka. Catatan offline yang belum tersinkron belum diketahui server. Pengingat yang tidak terkirim sebelum tengah malam tidak dikirim sebagai pengingat hari kemarin.

- `npm run test:sql:push`: PostgreSQL/PGlite lokal untuk RLS, zona waktu, kelayakan, duplikasi, lease, retry, dan penghapusan akun.
- `npm run test:unit -- test/unit/web-push.test.ts`: validasi endpoint/kunci, payload, dan klasifikasi respons layanan push.
- Tes browser dengan API tiruan memeriksa alur izin, aktivasi, penghentian dan kegagalan; ini tidak membuktikan penerimaan push nyata.
- Verifikasi layanan nyata harus membedakan migrasi diterapkan, worker/jadwal berjalan, pesan diterima layanan push, dan notifikasi benar-benar tampil pada perangkat.

## Hasil verifikasi 23 November 2026

Migrasi dan Edge Function `daily-reminders` telah diterapkan pada `dompet-santai-26` (`fzgecrtixqllmhpxancs`) melalui SQL Editor dan editor fungsi dashboard. Penerapan SQL Editor tidak otomatis memperbarui riwayat migrasi Supabase CLI. Secrets VAPID/cron dan Vault telah dipasang, jadwal `* * * * *` aktif, dan katalog database mengonfirmasi RLS serta pembatasan izin tabel/RPC. Riwayat cron menunjukkan eksekusi berhasil; panggilan worker nyata mengembalikan HTTP 200. Permintaan dispatcher dengan rahasia salah ditolak HTTP 401. Security Advisor menunjukkan 0 error dan satu peringatan lama tentang perlindungan kata sandi bocor.

Tes SQL lokal lulus untuk RLS, zona waktu, pengecekan catatan, deduplikasi, lease/retry dan cascade. Lima tes unit serta enam skenario browser dengan API/izin tiruan lulus (aktivasi/penolakan izin, pengaturan mobile, panel dan logout). Typecheck dan build produksi juga lulus; worker push tergabung dalam service worker PWA.

`npm run test:live:push` telah memverifikasi Auth, status konfigurasi, larangan klaim dari akun biasa, pendaftaran/status/penghapusan dan isolasi dua akun pada Supabase nyata menggunakan endpoint inert yang tidak dikirimi pesan. Kedua akun sementara dibersihkan. Pendaftaran layanan push browser Chrome dan Edge pada lingkungan uji gagal dengan `AbortError`; karena itu penerimaan pesan Web Push melalui layanan nyata dan skenario penerimaan ketika aplikasi ditutup **belum terbukti**. Gunakan **Kirim notifikasi uji** pada perangkat nyata yang berhasil diaktifkan untuk memverifikasinya. Respons dispatcher HTTP 200 sendiri tidak membuktikan notifikasi diterima perangkat.
