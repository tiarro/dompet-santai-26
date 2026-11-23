# Dompet Santai

Aplikasi pencatatan keuangan yang dibangun dengan Nuxt 4, TypeScript, Supabase, Vitest, dan Playwright.

## Menjalankan proyek

```powershell
Copy-Item .env.example .env
npm install
npm run dev
```

Isi `NUXT_PUBLIC_SUPABASE_URL` dan `NUXT_PUBLIC_SUPABASE_KEY` pada `.env` dengan kredensial proyek Supabase Anda. Nilai placeholder pada konfigurasi hanya memungkinkan aplikasi dan test berjalan sebelum kredensial tersedia; jangan gunakan untuk data produksi.

Konfigurasi juga menerima `SUPABASE_URL` dan `SUPABASE_PUBLISHABLE_KEY`. Variabel `NUXT_PUBLIC_SUPABASE_*` di atas diprioritaskan jika keduanya tersedia. Gunakan publishable key untuk klien browser; secret key hanya untuk server. Mulai ulang `npm run dev` setelah mengubah `.env`.

## Registrasi

Halaman `/register` menggunakan Supabase Auth dengan email dan kata sandi (minimal 8 karakter). Nama panggilan disimpan sebagai `user_metadata.username`, hanya untuk tampilan; login tetap memakai email. Jika sesi tersedia setelah pendaftaran, pengguna diarahkan ke `/onboarding`. Jika konfirmasi email aktif, halaman menampilkan petunjuk untuk memeriksa email.

Tambahkan URL onboarding yang digunakan aplikasi (misalnya `http://localhost:3000/onboarding`, serta URL produksi yang sesuai) ke **Authentication > URL Configuration > Redirect URLs** di Supabase agar tautan konfirmasi kembali ke aplikasi. Pengaturan konfirmasi email mengikuti proyek Supabase. Profil onboarding dan seluruh data keuangan utama disimpan di Supabase setelah migrasi diterapkan.

## Lupa dan atur ulang kata sandi

Pada `/login`, isi alamat email lalu pilih **Lupa kata sandi?**. Aplikasi mengirim permintaan pemulihan melalui Supabase Auth dan menampilkan pesan netral agar tidak mengungkap apakah email sudah terdaftar. Buka tautan email pada browser dan origin yang sama dengan permintaan awal; alur PKCE memerlukan verifier yang tersimpan di browser tersebut.

Halaman publik `/atur-ulang-kata-sandi` menunggu pertukaran kode oleh client Supabase Nuxt, memverifikasi sesi melalui Auth, lalu meminta kata sandi baru minimal 8 karakter dan konfirmasi yang sama. Ketentuan kata sandi tambahan mengikuti konfigurasi Supabase. Akun yang sedang diubah ditampilkan di formulir. Formulir menyesuaikan layar HP/desktop dan tema terang/gelap aplikasi. Tautan kedaluwarsa, kode yang sudah dipakai, callback yang belum terselesaikan, atau sesi yang tidak tersedia menampilkan petunjuk meminta tautan baru; callback gagal tidak boleh menggunakan sesi akun lain yang kebetulan masih tersimpan. Parameter callback dibersihkan dari address bar setelah pemeriksaan. Halaman memakai `no-store`, `noindex`, dan kebijakan referrer `no-referrer`.

Penyimpanan memeriksa ulang akun/sesi sebelum memanggil `updateUser({ password })`. Validasi atau gangguan koneksi mempertahankan isian untuk dicoba lagi; perubahan akun atau sesi yang berakhir menutup formulir. Setelah berhasil, kata sandi dibersihkan dari formulir dan sesi browser ini diakhiri dengan scope `local`, lalu tersedia tombol **Masuk dengan kata sandi baru**. Jika endpoint logout gagal tetapi SDK sudah membersihkan sesi lokal, tombol masuk tetap tersedia. Jika sesi masih tersimpan, keberhasilan perubahan kata sandi tetap ditampilkan dengan tombol mencoba keluar kembali. Data keuangan dan sesi perangkat lain tidak direset oleh aplikasi.

Tambahkan `http://localhost:3000/atur-ulang-kata-sandi` serta URL LAN/produksi yang digunakan ke **Authentication > URL Configuration > Redirect URLs** di Supabase. Template email **Reset Password** harus mempertahankan tautan konfirmasi Supabase (`{{ .ConfirmationURL }}`) agar proses verifikasi kembali ke URL tersebut. Pengiriman email mengikuti konfigurasi SMTP, pembatasan kirim, dan masa berlaku tautan proyek Supabase. Fitur ini tidak membutuhkan migrasi database atau secret key baru.

Pengujian browser berada di `test/e2e/password-reset.spec.ts` dan memakai respons Auth/database tiruan. Jalankan bersama regresi login dengan `npm run test:e2e -- test/e2e/password-reset.spec.ts test/e2e/login.spec.ts test/e2e/google-login.spec.ts --workers=1`. Ketiga suite memakai `auth-fixture.ts` untuk mengisolasi font eksternal dan memakai font fallback, sehingga server font tidak menghambat pemeriksaan autentikasi. Pengiriman email, Redirect URLs, dan perubahan kata sandi pada akun Supabase nyata perlu diverifikasi terpisah; test tiruan bukan bukti layanan cloud berhasil.

Verifikasi lokal fitur ini: 16 skenario pemulihan dan 11 regresi login email/Google lolos dengan API tiruan, termasuk pemeriksaan tampilan HP pada tema gelap. Pemeriksaan TypeScript proyek tersedia melalui `npm run typecheck`; hasil pemeriksaannya dicatat pada bagian TypeScript dan lifecycle plugin.

## Database

Jalankan tiga migrasi Supabase secara berurutan: supabase/migrations/20260810000000_create_transactions.sql untuk skema prototipe lama, supabase/migrations/20261008000000_create_finance_cloud_storage.sql untuk skema keuangan utama dan RPC snapshot, serta supabase/migrations/20261008000001_create_receipts_storage.sql untuk bucket struk privat. Setelah itu, useCloudFinance() menjadi sumber data utama aplikasi.


## Supabase sebagai penyimpanan utama

Setelah migrasi diterapkan, aplikasi menggunakan Supabase sebagai sumber utama untuk profil onboarding, pengaturan, dompet, kategori, catatan transaksi, anggaran, target tabungan, perpindahan tabungan, dan foto struk. replace_finance_snapshot mengganti seluruh snapshot milik pengguna secara atomik dan menghapus baris lama yang sudah tidak ada dalam payload. get_finance_snapshot memuat data akun setelah navigasi atau saat jendela kembali fokus.

Data tersimpan otomatis di akun Anda dan dapat diakses dari perangkat lain setelah login dengan akun yang sama. Fitur migrasi data browser sudah dihapus. Backup JSON, pemulihan backup, dan reset data keuangan tetap tersedia di Pengaturan; data browser lama tidak dihapus otomatis.

Jangan menaruh SUPABASE_SECRET_KEY pada NUXT_PUBLIC_* atau kode app/. Secret key hanya dipakai endpoint server yang membutuhkannya. Uji RLS dengan dua akun sebelum memakai database produksi: setiap akun hanya boleh membaca dan menulis baris miliknya sendiri.

## PWA online-first

Proyek memiliki konfigurasi PWA dan service worker untuk precache aset serta fallback offline.html. Instalasi produksi masih perlu diverifikasi. Saat aplikasi sudah terbuka dan data akun telah dimuat, transaksi baru dapat disimpan di IndexedDB dengan status **Menunggu sinkronisasi**, lalu divalidasi dan dikirim setelah internet kembali. Saldo resmi berubah setelah server menerima transaksi. Snapshot cloud tidak dicache, sehingga membuka ulang aplikasi sepenuhnya offline belum didukung. Lihat [alur transaksi offline](docs/offline-transactions.md). Foto kamera pada alamat LAN HTTP mengikuti batasan browser dan biasanya memerlukan HTTPS atau localhost.
## Notifikasi dan status baca lintas perangkat

Judul panel menampilkan **Notifikasi** tanpa angka. Jumlah seluruh pengingat aktif ditampilkan pada tab **Semua**, sedangkan jumlah yang belum dibaca ditampilkan pada tab **Belum dibaca**, dengan gaya angka yang sama. Tinggi panel tetap saat daftar berisi maupun kosong, termasuk ketika berganti tab: desktop menggunakan tinggi maksimal 48rem yang dibatasi 88% tinggi layar, sedangkan HP menggunakan 94% tinggi layar. Area daftar dapat digulir dan footer tetap berada di bawah panel.

Ikon lonceng menampilkan pengingat tagihan, anggaran, tabungan, serta pencatatan harian. Klik item atau **Tandai semua dibaca** untuk menandai tahap pengingat tersebut. Status baca tersimpan per akun di tabel Supabase `notification_reads` melalui migrasi `supabase/migrations/20261123032704_create_notification_reads.sql`. Tabel terpisah dari snapshot keuangan, dilindungi RLS, dan hanya memberi akun terautentikasi akses baca/tambah penanda miliknya sendiri. Tidak diperlukan secret key baru di browser.

Ketika offline, penanda langsung terlihat dan masuk antrean IndexedDB perangkat. Aplikasi mengirim ulang ketika online, saat kembali aktif, saat panel dibuka, atau setiap 30 detik selama terlihat. Perangkat lain mengambil pembaruan pada kesempatan yang sama; ini belum sinkronisasi Realtime. Pengiriman menambah penanda tanpa mengganti daftar, sehingga perubahan dari perangkat lain tidak ditimpa. ID tahap tetap dibedakan: tagihan yang sudah dibaca hari ini muncul belum dibaca lagi ketika menjadi terlambat. Waktu baca berasal dari perangkat dan pengiriman ulang mempertahankan waktu yang lebih dahulu diterima server.

Status lama dari localStorage diimpor otomatis untuk akun yang sama dengan waktu impor, karena format lama tidak mencatat waktu baca. Antrean dipisahkan per akun dan tidak dihapus saat logout; hanya akun aktif yang mengirimkannya. Kegagalan sinkronisasi ditampilkan beserta tombol **Coba lagi**. Jika IndexedDB diblokir, penanda yang belum tersinkron hanya bertahan selama sesi. Data situs yang dihapus dapat menghilangkan antrean lokal; keterbatasan membuka aplikasi sepenuhnya offline tetap berlaku. Backup/restore/reset keuangan tidak mencakup status baca. Detail ada di [dokumentasi notifikasi](docs/notifications.md).

### Web Push pengingat mencatat

Di **Pengaturan > Pengingat**, aktifkan **Ingatkan mencatat setiap hari**, pilih jam, lalu **Simpan Pengaturan**. Tekan **Aktifkan notifikasi perangkat** dan izinkan permintaan browser pada setiap perangkat. **Kirim notifikasi uji** memeriksa pengiriman perangkat tersebut; **Nonaktifkan perangkat ini** menghentikannya. Logout juga menghentikan langganan lokal. Pengingat menabung, tagihan, dan anggaran tetap tampil di dalam aplikasi.

Server Supabase memeriksa setiap menit berdasarkan zona waktu perangkat dan jam pengingat akun. Pengiriman dilakukan sekali per hari per perangkat jika belum ada catatan bertanggal hari itu di server, termasuk saat aplikasi ditutup. Catatan yang masih dalam antrean offline belum dapat diketahui server. Perubahan zona waktu perangkat diperbarui ketika bagian Pengingat dibuka. Klik notifikasi membuka formulir Tambah Catatan. Tidak ada nominal atau rincian keuangan dalam payload push.

Web Push membutuhkan HTTPS atau localhost, izin notifikasi, browser yang mendukung, serta akses internet. iPhone/iPad memerlukan iOS 16.4+ dan aplikasi yang ditambahkan ke Layar Utama. Penutupan paksa browser, mode senyap, penghematan baterai, dan pembatasan sistem dapat menunda atau mencegah tampilnya notifikasi; ini bukan alarm dengan jaminan tepat waktu. Tanggal kedaluwarsa mencegah pengingat hari sebelumnya tampil terlambat.

Penerapan server memerlukan migrasi `supabase/migrations/20261123050648_create_web_push_reminders.sql`, Edge Function `supabase/functions/daily-reminders`, secrets VAPID/cron, dan jadwal `supabase/schedule-web-push.sql`. Jalankan `node scripts/prepare-web-push.mjs` untuk menyiapkan kunci serta input Vault di `.cache/web-push/` tanpa mencetak rahasia; folder ini tidak masuk Git. Pertahankan kunci VAPID saat deploy ulang. Langkah lengkap dan verifikasi ada di [Web Push](docs/web-push.md). Jangan menaruh private key atau cron secret dalam `NUXT_PUBLIC_*`.

Pada 23 November 2026, migrasi, fungsi, secrets dan jadwal sudah dipasang pada proyek Supabase ini. Eksekusi cron serta dispatcher HTTP 200 dan pembatasan akses dua akun telah diverifikasi pada layanan nyata. Typecheck, build, tes SQL/unit dan browser dengan API tiruan lulus. Penerimaan push pada perangkat nyata belum terverifikasi karena browser uji Chrome/Edge gagal mendaftar ke layanan push (`AbortError`); lakukan **Kirim notifikasi uji** setelah aktivasi berhasil pada perangkat pengguna.

Pengujian terkait: `npm run test:sql:notifications` (SQL/RLS lokal dengan PGlite), unit `notifications`/`notification-read-storage`, dan browser `test/e2e/notification-sync.spec.ts` (API tiruan). Penerapan cloud dan verifikasi Supabase nyata dilaporkan terpisah dari tes tersebut.

Verifikasi 23 November 2026: migrasi di atas **sudah diterapkan melalui SQL Editor** pada proyek `fzgecrtixqllmhpxancs` (`dompet-santai-26`), lalu izin tabel/RLS diperiksa pada database nyata. Delapan tes unit, dua belas tes browser sinkronisasi, dua regresi panel, delapan regresi login Google, dan pemeriksaan SQL/RLS lokal lolos. `npm run test:live:notifications` juga lolos dengan Auth/database Supabase nyata: dua akun uji membuktikan isolasi akses, dua sesi browser membuktikan sinkronisasi, dan penandaan offline terkirim setelah reconnect. Akun uji beserta data terkait dihapus setelah pemeriksaan; data pengguna yang ada tidak dipakai sebagai fixture.

Perintah live tersebut memerlukan server dev aktif, konfigurasi `.env` yang sama dengan aplikasi, serta `SUPABASE_SECRET_KEY` khusus proses pengujian. Perintah membuat lalu menghapus dua akun sementara tanpa mengirim email; secret/token tidak dicetak atau disimpan ke berkas. Security Advisor yang diperbarui menampilkan 0 error dan satu peringatan Auth `Leaked Password Protection Disabled`; pengaturan Auth tersebut tidak diubah oleh fitur ini.

## Test

```powershell
npm run test:unit
npm run test:e2e
npm run typecheck
```

Struktur proyek mengikuti [Nuxt Directory Structure](https://nuxt.com/docs/4.x/directory-structure): kode UI berada dalam `app/`, API Nitro dalam `server/`, kontrak bersama dalam `shared/`, dan test dalam `test/`.

## TypeScript dan lifecycle plugin

`npm run typecheck` menjalankan pemeriksaan resmi Nuxt dengan `vue-tsc` pada project references di `tsconfig.json` (app, server, shared, dan konfigurasi Node), sekaligus menyiapkan tipe Nuxt. Perintah menggunakan dependency TypeScript/vue-tsc yang sudah terpasang; tidak mengubah data Supabase atau menjalankan pengujian browser.

Plugin `cloud-finance.client.ts` dan `pending-notes.client.ts` memakai `nuxtApp.vueApp.onUnmount` dari Vue 3.5 untuk menghentikan watcher, melepas listener, dan membersihkan timer saat aplikasi dilepas. Hook Nuxt `app:beforeUnmount` yang tidak tersedia sudah diganti. Pelepasan halaman biasa tetap mempertahankan plugin aplikasi, sehingga pemuatan cloud pada navigasi/focus dan sinkronisasi antrean offline tetap berjalan.

Verifikasi 23 November 2026: `npm run typecheck` selesai dengan exit code 0 untuk seluruh project references Nuxt. Empat regresi browser pada `settings.spec.ts` lolos: penambahan transaksi offline tanpa anggaran, sinkronisasi dua tab tanpa transaksi ganda, dashboard dengan cloud kosong, dan penolakan perubahan/restore dari snapshot kedaluwarsa. Pengujian memakai Auth/database tiruan. Pemeriksaan konflik restore menerima penolakan dari validasi snapshot klien maupun fingerprint server dan memastikan saldo terbaru tidak tertimpa; ini tidak menggantikan pengujian Supabase produksi.

## Pembaruan dokumentasi

Setiap perubahan kode, penambahan fitur, perbaikan bug, dan penyesuaian tampilan harus disertai pembaruan README dalam perubahan yang sama. Perbarui bagian yang terkait agar menjelaskan perilaku terbaru, cara penggunaan atau konfigurasi yang berubah, serta batasan yang relevan. Dokumentasikan hasil pengujian hanya jika sudah dijalankan; bedakan pemeriksaan dengan API tiruan dari verifikasi layanan nyata.

## Tambah Catatan (versi awal)

Tombol Tambah Catatan membuka modal desktop atau panel bawah di HP, mengikuti tema terang/gelap dashboard. Pengguna memilih pengeluaran/pemasukan, nominal rupiah bulat, kategori, rekening, tanggal sampai hari ini, dan keterangan opsional. Isian yang belum disimpan dikonfirmasi sebelum dibuang.

Catatan aktif disimpan di Supabase melalui RPC snapshot dan RLS per akun. Perubahan dari perangkat lain dimuat ulang saat navigasi atau aplikasi kembali fokus. Pilihan rekening disimpan dalam data cloud akun. Rekening terakhir dipakai kembali jika masih tersedia.

Dashboard masih berupa pratinjau dengan saldo awal dan ringkasan harian contoh:
- Saldo = total saldo awal di Pengaturan + pemasukan tercatat - pengeluaran tercatat. Bawaan awal Rp8.450.000 masih berupa contoh.
- Uang Aman Dipakai = saldo tersebut - dana target tabungan - saldo Tabungan lama yang belum dialokasikan. Ini belum memperhitungkan kewajiban/tagihan.
- Pengeluaran hari ini = Rp125.000 contoh + pengeluaran bertanggal hari ini.
- Anggaran kategori mengikuti batas yang dibuat pengguna dan pengeluaran bulan berjalan pada kategori terkait, tanpa pengeluaran contoh.
- Urungkan membatalkan catatan terakhir yang baru disimpan dan memperbarui ringkasan. Daftar menampilkan lima catatan terbaru.

Migrasi keuangan membuat profil, pengaturan, dompet, kategori, transaksi, anggaran, target, perpindahan tabungan, dan penanda migrasi. Semua tabel keuangan memakai RLS berdasarkan auth.uid(), sedangkan fungsi snapshot hanya dapat dipanggil pengguna terautentikasi.

Tes fitur berada di test/unit/notes.test.ts dan test/e2e/notes.spec.ts. Tes browser memakai autentikasi tiruan, tanpa membuat akun atau mengubah data Supabase.

Saldo contoh dibagi menjadi Tunai Rp450.000, Bank Rp6.500.000, E-Wallet Rp1.500.000, dan Tabungan Rp0 (total Rp8.450.000). Pilihan Bayar dari/Masuk ke menampilkan saldo masing-masing berdasarkan catatan akun di browser. Pengeluaran melebihi saldo sumber yang dipilih tidak dapat disimpan; nominal tepat sebesar saldo diperbolehkan. Pemasukan tetap dapat dicatat meskipun saldo sumber kosong. Pemeriksaan menggunakan saldo saat ini, termasuk catatan bertanggal lampau.

Foto struk bersifat opsional (satu foto per catatan). Pilih berkas atau gunakan tombol Ambil foto; kamera langsung dibuka di dalam browser, dengan kamera belakang diprioritaskan pada HP. Pengguna mengizinkan akses kamera lalu menekan Jepret foto. Kamera dimatikan setelah foto diambil, panel ditutup, atau halaman disembunyikan. Akses kamera memerlukan HTTPS (atau localhost pada komputer yang sama); HTTP melalui alamat IP lokal di HP tidak dapat memakai kamera browser. JPG, PNG, dan WebP maksimal 10 MB diterima, diperkecil hingga sisi terpanjang 2400 piksel dan dikompresi sebagai JPEG sebelum disimpan bersama catatan. Pratinjau muncul otomatis, dapat diperbesar, diganti, atau dihapus sebelum menyimpan. Catatan yang memiliki foto menyediakan tombol Lihat struk. Foto dikompresi sebagai JPEG lalu disimpan di bucket Supabase Storage receipts yang privat dengan path berawalan ID akun. Jika unggahan gagal, isian tetap tersedia untuk dicoba ulang. Pembacaan nominal struk dijelaskan pada bagian OCR berikut.

## OCR struk di browser/perangkat

Setelah foto baru dipilih atau diambil, aplikasi membaca tulisan menggunakan Tesseract.js 7 di Web Worker. Panel **Baca nominal dari struk** menampilkan progres dan saran total. Tekan **Gunakan nominal** untuk mengisi nominal transaksi; hasil tidak otomatis menimpa isian manual atau menyimpan transaksi. Nominal tetap bisa dikoreksi, dan validasi saldo/anggaran mengikuti alur catatan biasa. Saat mengedit catatan dengan struk lama, pembacaan dimulai hanya setelah menekan **Baca nominal**.

Pembaca mencari label `GRAND TOTAL`, `TOTAL BAYAR`, `JUMLAH BAYAR`, atau `TOTAL`, bukan angka terbesar. Subtotal, pajak, jumlah barang, uang tunai, dan kembalian tidak dipakai sebagai total. Total berbeda yang sama kuatnya meminta pemeriksaan manual. Format rupiah seperti `85.000`, `85.000,00`, dan `85,000.00` didukung; pecahan rupiah bukan nol, total negatif, dan nominal di luar batas aplikasi ditolak. Hasil OCR dapat keliru pada foto buram, tulisan kecil, atau tata letak struk yang tidak didukung; selalu periksa hasilnya.

**Batalkan pembacaan** menghentikan proses tanpa menghapus struk atau isian transaksi. **Baca ulang struk** mencoba kembali. Mengganti/menghapus foto atau menutup form menghentikan pembacaan lama, sehingga hasil terlambat tidak diterapkan ke foto atau catatan berikutnya. Kegagalan OCR tidak memblokir pencatatan manual. Pembacaan dibatasi 60 detik untuk menghindari proses yang terus berjalan.

Foto diproses di perangkat, tanpa API OCR berbayar, API key baru, atau pengiriman foto ke penyedia OCR. Penyimpanan struk ke Supabase tetap terjadi saat catatan disimpan sesuai alur sebelumnya. Teks OCR tidak disimpan pada transaksi, backup, atau database; fitur ini tidak memerlukan migrasi SQL.

Aset engine dan model Inggris/Indonesia berasal dari dependency yang dikunci versinya di `package-lock.json`, lalu disalin ke `public/ocr/v7` oleh `scripts/prepare-ocr-assets.mjs`. Folder hasil salinan diabaikan Git. `npm install`, `npm run dev`, `npm run build`, dan `npm run generate` menyiapkannya otomatis; jalankan `npm run prepare:ocr` jika memakai server dev yang sudah berjalan. Deploy hasil build harus menyertakan aset publik tersebut. Runtime memuat aset dari origin aplikasi sendiri, tanpa CDN OCR pihak ketiga.

Model bahasa di-cache oleh Tesseract di IndexedDB jika browser mengizinkan. Aset OCR dimuat saat diperlukan dan dikecualikan dari precache PWA agar semua variasi engine tidak diunduh saat instalasi. **OCR di perangkat bukan jaminan OCR sepenuhnya offline**: pemuatan awal engine/model memerlukan koneksi ke aplikasi, dan pembacaan saat offline bergantung pada ketersediaan aset/cache. Browser perlu mendukung Web Worker, nested worker, dan WebAssembly. Keterbatasan PWA/login offline yang sudah ada tetap berlaku.

Aturan ekstraksi total diuji pada `test/unit/receipt-total.test.ts`, sedangkan batas waktu dan pembersihan worker diuji pada `test/unit/receipt-ocr-worker.test.ts`. Jalankan `npm run test:unit -- test/unit/receipt-total.test.ts test/unit/receipt-ocr-worker.test.ts` dan `npm run test:e2e -- test/e2e/receipt-ocr.spec.ts --workers=1`.

Verifikasi lokal: **39 tes unit dan 12 tes browser lolos**, serta `npm run build` berhasil. Dua tes browser memakai engine OCR nyata untuk membaca total Rp85.000 pada gambar struk buatan yang jelas dan membatalkan inisialisasi beserta worker turunannya; sepuluh tes lainnya memakai worker tiruan untuk alur UI, kegagalan, penggantian foto, penyimpanan manual, validasi saldo, pengeditan struk lama, dan tata letak HP. Auth/database ditirukan pada seluruh pemeriksaan browser. Aset engine/model terbukti ada di `.output/public`, sedangkan manifest precache PWA tidak memuat aset OCR. Hasil ini bukan verifikasi Supabase produksi atau bukti ketepatan semua struk/HP nyata.


## Pengeluaran dengan atau tanpa anggaran

Anggaran bersifat opsional. Pengguna dapat menyimpan pengeluaran, mengubah catatan lama, atau mengubah pemasukan menjadi pengeluaran tanpa membuat anggaran terlebih dahulu. Onboarding tetap berjalan seperti sebelumnya. Validasi nominal, kategori, tanggal, saldo, dan dompet tetap berlaku; saldo yang tidak mencukupi tetap memblokir penyimpanan.

Setelah memilih kategori dan tanggal pada form catatan, pengguna diberi tahu jika belum ada anggaran untuk kategori dan bulan tersebut. Catatan tetap memakai kategori aslinya di Riwayat, sedangkan nominalnya ditampilkan dalam kelompok **Pengeluaran tanpa anggaran** pada halaman Anggaran. Kelompok ini bukan kategori baru. Jika anggaran dibuat kemudian untuk kategori dan bulan yang sama, pengeluaran sebelumnya otomatis masuk perhitungan anggaran tersebut.

Tombol opsional **Buat Anggaran** di form membuka isian batas anggaran tanpa meninggalkan catatan. Kategori dan bulan mengikuti tanggal catatan; pengguna cukup mengisi batas nominal lalu menekan **Simpan Anggaran**, atau **Batal anggaran** untuk melanjutkan tanpa anggaran. Anggaran cepat tidak menetapkan dompet default; pengaturan dompet dapat diubah kemudian di menu Anggaran. Menyimpan anggaran tidak menyimpan transaksi, dan nominal, tanggal, dompet, keterangan, serta struk catatan tetap tersedia. Kegagalan penyimpanan mempertahankan isian; tombol **Muat ulang data** tersedia saat data cloud perlu diperbarui sebelum mencoba lagi. Saat isian anggaran terbuka, simpan atau batalkan anggaran sebelum menyimpan catatan.

Pembuatan anggaran memerlukan koneksi. Catatan offline tetap dapat masuk antrean tanpa anggaran, lalu diperiksa terhadap saldo dan data terbaru saat sinkronisasi. Dompet pembayaran yang dipilih pada catatan tetap dipakai meskipun berbeda dari default anggaran atau default berubah sebelum sinkronisasi. Dompet tersebut harus tetap aktif dan saldonya mencukupi. Data anggaran yang gagal dimuat tidak dianggap sebagai anggaran kosong. Melewati batas nominal anggaran tetap berupa peringatan selama saldo dompet cukup.

Pengujian terkait berada di `test/unit/budgets.test.ts`, `test/unit/pending-notes.test.ts`, skenario `optional budgets` pada `test/e2e/notes.spec.ts`, serta skenario transaksi offline pada `test/e2e/settings.spec.ts`. Test browser memakai API tiruan, bukan verifikasi Supabase produksi.

Pengeditan dan penghapusan tetap menolak catatan yang sudah berubah. Pemeriksaan memakai fingerprint isi catatan yang sama dengan validasi saldo, sehingga urutan properti setelah pemuatan cloud tidak menimbulkan konflik palsu saat mengedit berulang.

## Anggaran (versi awal)

Menu Anggaran membuka halaman /anggaran. Pilih bulan kalender, buat batas per kategori, lalu buka kategori untuk melihat pengeluaran, mengubah batas, atau mencatat pengeluaran dengan kategori dan periode terisi. Periode mendatang dapat direncanakan; catatan pengeluarannya baru tersedia saat periode dimulai. Satu kategori hanya memiliki satu batas per bulan; belum ada pengulangan otomatis atau penghapusan anggaran.

Ringkasan menghitung kategori yang memiliki anggaran; pengeluaran tanpa anggaran ditampilkan terpisah. Pengeluaran mengikuti tanggal catatan, dari semua dompet, tanpa pemasukan. Status aman di bawah 75%, mendekati batas mulai 75%, batas tercapai pada 100%, dan terlewati di atas 100%. Melewati anggaran memberi peringatan pada form catatan, tetapi tidak memblokir transaksi selama saldo dompet cukup. Urungkan catatan memperbarui anggaran kembali. Batas anggaran tidak memindahkan uang atau mengurangi saldo maupun dana tabungan di Beranda.

Batas anggaran tersimpan di Supabase bersama data akun dan dimuat ulang saat aplikasi bernavigasi atau kembali fokus. Tema terang/gelap dan navigasi desktop/HP mengikuti tampilan aplikasi.


## Kategori tambahan

Tombol Tambah Kategori tersedia pada form Buat Anggaran dan Tambah Catatan. Isi nama 1-32 karakter dan pilih ikon; kategori langsung tersimpan dan terpilih tanpa menghapus isian anggaran/catatan. Nama duplikat dalam jenis yang sama ditolak, termasuk nama kategori bawaan, dengan mengabaikan besar/kecil huruf dan spasi berlebih.

Pada popup Tambah/Ubah Catatan, **+ Tambah Kategori** tampil sebagai kotak terakhir dalam deretan kategori untuk pengeluaran maupun pemasukan. Kategori **Lainnya** tetap tersedia untuk catatan yang belum cocok dengan kategori lain. Tombol tambahan di bawah deretan dihapus agar tidak ganda. Form kategori baru terbuka selebar deretan; Batal kategori mengembalikan fokus ke kotak Tambah Kategori dan mempertahankan isian catatan. Form Buat/Ubah Anggaran tetap menggunakan tombol Tambah Kategori seperti sebelumnya.

Kategori pengeluaran digunakan bersama oleh anggaran dan catatan; kategori pemasukan hanya tersedia untuk pemasukan. Kategori tambahan tersimpan di Supabase bersama data akun dan dilindungi RLS. Membatalkan form catatan/anggaran tidak menghapus kategori yang sudah disimpan. Kategori tambahan dapat diubah dan diarsipkan melalui Pengaturan; belum ada penghapusan permanen kategori. Catatan lama dan kategori bawaan tetap kompatibel. Kegagalan penyimpanan kategori mempertahankan isian untuk dicoba kembali.

## Dompet default untuk anggaran

Saat membuat atau mengubah anggaran dengan dompet default, batas anggaran tidak boleh melebihi saldo dompet tersebut saat ini. Tombol Simpan Anggaran dinonaktifkan dan alasan ditampilkan jika saldo kurang; batas yang sama dengan saldo diperbolehkan. Mengubah batas atau dompet langsung memperbarui validasi. Tanpa pilihan default, pemeriksaan saldo dompet ini tidak berlaku. Penyimpanan memeriksa ulang saldo dari catatan terbaru per akun untuk menangani perubahan di tab lain. Pemeriksaan dilakukan per anggaran, tanpa menjumlahkan alokasi anggaran lain atau mengurangi saldo.

Pada form Buat/Ubah Anggaran, pilihan opsional Biasanya bayar dari menyimpan dompet default untuk kategori dan bulan tersebut. Pilihan menampilkan saldo dompet yang tersedia. Dompet juga ditampilkan pada kartu dan detail anggaran; pengaturan ini tidak memindahkan atau mengurangi uang.

Pada Tambah Catatan pengeluaran, Bayar dari otomatis menyarankan dompet default anggaran untuk kategori dan bulan tanggal transaksi, termasuk saat dibuka dari Catat Pengeluaran. Pengguna bebas menggantinya ke dompet aktif lain tanpa popup konfirmasi tambahan. Saat berbeda, keterangan di bawah pilihan dompet menjelaskan sumber pembayaran yang dipakai dan bahwa default anggaran tetap sama. Contoh: "Pembayaran ini memakai Tunai. Default anggaran tetap Bank." Saldo dompet yang benar-benar dipilih berkurang dan pengeluaran tetap dihitung pada anggaran kategori serta bulan transaksi tersebut.

Pilihan manual dipertahankan selama formulir terbuka, termasuk saat kategori, tanggal, atau data anggaran berubah. Tanpa pilihan manual, saran mengikuti kategori dan bulan yang dipilih. Form catatan baru kembali menggunakan default anggaran; mengganti dompet untuk satu transaksi tidak mengubah pengaturan anggaran. Ubah Anggaran tetap digunakan untuk mengubah atau mengosongkan default secara permanen. Jika dompet default tidak tersedia, form memakai dompet lain yang tersedia dan memberi keterangan, tanpa mewajibkan perubahan anggaran.

Semua kategori mengikuti perilaku tersebut; kategori Lainnya tetap menyediakan Tunai, Bank, atau E-Wallet. Anggaran tanpa default memakai dompet terakhir yang tersedia atau dompet pertama. Pemasukan bebas memilih dompet, sedangkan pengeditan catatan mempertahankan dompet pembayaran yang tersimpan sampai pengguna menggantinya. Penyimpanan online dan sinkronisasi offline tidak lagi mensyaratkan kecocokan dengan default anggaran; validasi dompet aktif dan saldo tetap berlaku.

Pengeluaran mengurangi anggaran kategori dan saldo sumber yang dipilih pada catatan. Pengeluaran melebihi saldo tidak dapat disimpan, sedangkan melewati anggaran tetap berupa peringatan. Anggaran lama tanpa default tetap kompatibel; pilihan dapat diubah atau dikosongkan lewat Ubah Anggaran, tanpa mengubah catatan yang sudah ada.

## Tabungan

Menu /tabungan menyediakan target bernama dengan ikon, nominal, tenggat opsional, serta pengingat tanggal bulanan. Target bisa diubah, diarsipkan ketika tercapai, dan diaktifkan kembali. Progres, sisa target, estimasi setoran bulanan, serta kartu Beranda dihitung dari setoran dan penarikan yang benar-benar tercatat. Pengingat tampil di dalam aplikasi mulai tanggal pilihan sampai ada setoran pada bulan tersebut; tanggal 29–31 mengikuti hari terakhir bulan yang lebih pendek. Tidak ada notifikasi latar belakang atau transfer bank otomatis.

Tambah Tabungan memindahkan dana dari Tunai, Bank, atau E-Wallet ke satu target. Tarik Dana memindahkan dana target ke dompet pilihan setelah konfirmasi. Nominal harus rupiah bulat positif; setoran maksimal saldo sumber dan penarikan maksimal dana target. Tanggal transfer adalah hari pencatatan. Transfer tidak menambah pemasukan, pengeluaran, atau pemakaian anggaran. Total uang tetap sama. Dana satu transfer hanya dimiliki satu target; dana target tidak dapat dibelanjakan melalui catatan biasa. Edit, hapus, dan Urungkan catatan juga memeriksa saldo setelah transfer sehingga pemasukan yang sudah ditabung tidak bisa dibatalkan jika membuat saldo negatif.

Target berisi dana tidak dapat dihapus: tarik dahulu seluruh dana ke dompet. Penghapusan target kosong mempertahankan riwayatnya. Target arsip tetap menyisihkan dana dan mempertahankan riwayat; aktifkan kembali untuk menarik atau menambah dana. Target boleh menerima dana di atas nominal tujuan; progres visual dibatasi 100%, nominal asli tetap ditampilkan.

Target dan transfer tabungan tersimpan di Supabase bersama transaksi dan dompet. Penyimpanan baru menampilkan hasil setelah RPC berhasil; RLS membatasi setiap akun pada datanya sendiri.

Saldo awal dompet mengikuti Pengaturan, dengan bawaan contoh yang didokumentasikan di atas. Uang Aman Dipakai kini mengurangi dana tabungan aktual, termasuk target arsip dan saldo Tabungan lama; belum memperhitungkan tagihan. Riwayat transfer ada di menu Tabungan, sedangkan Riwayat transaksi tetap khusus pemasukan/pengeluaran. Tes fitur: test/unit/savings.test.ts dan test/e2e/savings.spec.ts.

## Riwayat

Menu /riwayat menampilkan catatan asli yang tersimpan per akun di Supabase. Periode awal adalah bulan ini; tersedia bulan sebelumnya, semua tanggal, dan rentang tanggal inklusif sampai hari ini. Pencarian keterangan/nama kategori digabungkan dengan filter jenis, dompet, dan kategori (termasuk kategori tambahan). Ringkasan pemasukan, pengeluaran, serta selisih selalu dihitung dari seluruh hasil filter; selisih bukan saldo dompet. Daftar diurutkan berdasarkan tanggal transaksi terbaru, lalu waktu pembuatan, dan dikelompokkan per tanggal. Daftar memuat 50 baris awal dan dapat diperluas sampai semua hasil tampil.

Detail dibuka sebagai dialog sehingga filter dan posisi scroll daftar tetap terjaga. Detail memperlihatkan dompet aktual, tanggal, keterangan, dan struk yang dapat diperbesar. Ubah Catatan mengisi seluruh nilai lama, termasuk dompet dan struk; default dompet anggaran tidak menggantikan dompet yang tersimpan. Penggantian struk dan penghapusannya didukung melalui form yang sama. Membatalkan perubahan mempertahankan catatan lama.

Ubah/hapus membaca penyimpanan terbaru, memeriksa apakah transaksi masih sama, kemudian menghitung saldo semua dompet setelah penggantian/penghapusan. Pengeluaran lama tidak dihitung dua kali. Perubahan yang menghasilkan saldo negatif diblokir, termasuk menghapus, mengurangi, atau memindahkan pemasukan yang sudah dibelanjakan. Validasi yang sama berlaku pada Urungkan. Saldo memakai saldo awal dari Pengaturan dan seluruh catatan sampai hari ini; ini belum validasi saldo historis per hari. Anggaran dihitung ulang dari kategori dan tanggal hasil perubahan. Hapus memerlukan konfirmasi transaksi dan menghapus struk terkait. Kegagalan penyimpanan atau konflik perubahan tidak menghasilkan pesan sukses dan tidak menimpa transaksi terbaru.

Data Riwayat berasal dari Supabase sehingga dapat dilihat lintas perangkat setelah login. Tes Riwayat ada di test/unit/history.test.ts dan test/e2e/history.spec.ts; autentikasi browser ditirukan tanpa menulis ke Supabase.

## Pengaturan

Menu /pengaturan tersedia dengan label Pengaturan dari navigasi HP dan desktop. Profil menampilkan email dan memungkinkan perubahan nama panggilan melalui Supabase Auth; metadata ini hanya untuk tampilan, bukan otorisasi. Tombol Keluar Akun berada di popup profil yang dibuka melalui avatar atau Edit Profil. Keluar memerlukan konfirmasi dan memakai scope local, mengakhiri sesi browser ini tanpa menghapus data keuangan atau mengeluarkan perangkat lain. Isian profil yang belum disimpan dipertahankan jika keluar dibatalkan. Jika Supabase sudah membersihkan sesi lokal meskipun endpoint logout gagal, aplikasi tetap kembali ke halaman login. Perubahan profil memerlukan koneksi.

Lebar popup Profil mengikuti popup Buat Target: maksimal 32rem (512px pada ukuran font dasar 16px) di desktop, dengan penyesuaian terhadap lebar layar. Pada layar hingga 640px, keduanya menggunakan panel bawah dengan batas lebar dialog yang sama. Kesamaan lebar telah diperiksa di browser pada lebar layar 390, 620, 640, 641, dan 1280px menggunakan API tiruan.

Dompet Tunai, Bank, dan E-Wallet memiliki saldo awal yang dapat diatur dalam rupiah bulat nonnegatif. Saldo awal bukan pemasukan. Semua pemeriksaan catatan (termasuk edit/hapus/Urungkan), anggaran, transfer tabungan, dan ringkasan dashboard memakai saldo tersebut. Perubahan yang menyebabkan saldo tersedia negatif ditolak. Dompet yang masih bersaldo atau terhubung ke anggaran tidak dapat dinonaktifkan; riwayat dompet kosong tetap disimpan. Pilihan Tabungan lama mengatur ketersediaan dompet tersebut untuk catatan, terpisah dari dana target yang tetap terlindungi.

Tema terang, gelap, atau mengikuti perangkat disimpan per akun. Mode sistem mengikuti perubahan preferensi perangkat selama aplikasi dibuka. Pengingat mencatat muncul setelah waktu pilihan jika belum ada catatan hari ini. Pengingat menabung dapat dimatikan secara global; jadwal per target tetap tersimpan. Keduanya hanya tampil dalam aplikasi, bukan push atau notifikasi latar belakang. Mata uang tetap IDR dan bahasa tetap Indonesia; periode anggaran tetap bulan kalender.

Kategori tambahan dapat dibuat, diubah nama/ikon, diarsipkan, dan diaktifkan kembali. Arsip menghilangkan kategori dari pilihan catatan/anggaran baru, tanpa menghilangkan riwayat atau anggaran lama. Catatan lama dapat tetap mempertahankan kategorinya saat diedit. Kategori bawaan tidak dapat diubah; tidak ada penghapusan permanen kategori.

Backup JSON maksimal 15 MB memuat catatan beserta struk, anggaran, kategori, target dan transfer tabungan, serta pengaturan. Backup tidak mencakup kata sandi, token sesi, cookie, atau profil Auth. Impor hanya menerima versi yang didukung dan akun yang sama, memeriksa struktur, relasi kategori/target, tanggal, dan konsistensi saldo sebelum meminta konfirmasi penggantian. Preview yang sudah kedaluwarsa akibat perubahan data ditolak. Reset memerlukan mengetik RESET, mengosongkan data keuangan akun aktif dan mengatur saldo awal nol; akun lain serta sesi masuk tetap ada.

Backup lama yang kompatibel tetap dapat dipulihkan melalui Pilih Backup. Backup dan reset menggunakan snapshot Supabase atomik melalui RPC; preview restore memeriksa fingerprint data cloud sebelum penggantian.

Pengaturan keuangan, tema, saldo awal, dan status dompet tersimpan di Supabase dan tersedia lintas perangkat. Backup JSON tetap berguna sebagai salinan portabel; data browser lama tidak dihapus otomatis. Pengujian tersedia pada test/unit/settings.test.ts dan test/e2e/settings.spec.ts; autentikasi browser ditirukan tanpa mengubah akun nyata.


## Foto profil

Avatar di navigasi HP, desktop, dan popup Profil otomatis memakai ikon bawaan jika foto Google atau foto tersimpan gagal dibaca. Ikon pengganti tidak menghapus atau menimpa foto akun. Ketika sumber foto berubah, misalnya setelah unggahan berhasil, gambar baru dimuat kembali.

Klik foto profil lalu Ubah foto untuk memilih JPG, PNG, atau WebP dari HP/komputer (maksimal 10 MB). Pratinjau dipotong persegi di tengah dan diperkecil menjadi maksimal 512 x 512 piksel; metadata foto tidak ikut disimpan. Foto baru diunggah ketika Simpan Profil ditekan. Batalkan foto mengembalikan foto sebelumnya.

Foto disimpan per akun di bucket Supabase Storage privat `profile-photos`, maksimal 256 KB per JPEG hasil pemrosesan. Endpoint server memverifikasi access token melalui Supabase Auth dan menentukan path berdasarkan ID akun terverifikasi; klien tidak menentukan ID pemilik atau path. Foto tidak dimasukkan ke JWT atau metadata Auth. Nama, bio, dan gender tetap disimpan melalui Auth; jika unggah foto gagal setelah isian tersimpan, foto dapat dicoba kembali.

Server memerlukan `SUPABASE_SECRET_KEY` di `.env` serta URL Supabase yang sama dengan Auth. Jangan mengekspos secret key dengan awalan `NUXT_PUBLIC_`. Bucket privat dibuat otomatis saat unggahan pertama bila belum ada, tanpa kebijakan akses klien. Foto dibaca melalui endpoint terautentikasi dengan respons `private, no-store`. Restart server setelah mengubah `.env`. Deployment memerlukan server Nuxt/Nitro, bukan hosting HTML statis saja.
