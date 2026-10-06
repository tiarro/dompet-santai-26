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

Tambahkan URL onboarding yang digunakan aplikasi (misalnya `http://localhost:3000/onboarding`, serta URL produksi yang sesuai) ke **Authentication > URL Configuration > Redirect URLs** di Supabase agar tautan konfirmasi kembali ke aplikasi. Pengaturan konfirmasi email mengikuti proyek Supabase. Data keuangan dan status penyelesaian onboarding belum disimpan ke database.

## Database

Jalankan migrasi [supabase/migrations/20260810000000_create_transactions.sql](supabase/migrations/20260810000000_create_transactions.sql) pada proyek Supabase. Akses tabel berada di composable `app/composables/useTransactions.ts`, dan tipe database ada di `shared/types/database.ts`.

## Test

```powershell
npm run test:unit
npm run test:e2e
```

Struktur proyek mengikuti [Nuxt Directory Structure](https://nuxt.com/docs/4.x/directory-structure): kode UI berada dalam `app/`, API Nitro dalam `server/`, kontrak bersama dalam `shared/`, dan test dalam `test/`.

## Tambah Catatan (versi awal)

Tombol Tambah Catatan membuka modal desktop atau panel bawah di HP, mengikuti tema terang/gelap dashboard. Pengguna memilih pengeluaran/pemasukan, nominal rupiah bulat, kategori, rekening, tanggal sampai hari ini, dan keterangan opsional. Isian yang belum disimpan dikonfirmasi sebelum dibuang.

Catatan disimpan pada localStorage dengan kunci per akun, bukan di Supabase. Catatan tetap ada setelah halaman dimuat ulang pada browser/origin yang sama, tetapi belum tersinkron ke perangkat lain dan akan hilang jika data situs dihapus. Pilihan rekening mengikuti onboarding selama sesi aplikasi; setelah dimuat ulang, pilihan dasar Tunai, Bank, dan E-Wallet tersedia. Rekening terakhir dipakai kembali jika masih tersedia.

Dashboard masih berupa pratinjau dengan saldo awal dan ringkasan harian contoh:
- Saldo = Rp8.450.000 + pemasukan tercatat - pengeluaran tercatat.
- Uang Aman Dipakai = saldo tersebut - dana contoh yang disisihkan Rp6.300.000. Ini belum perhitungan kewajiban/tagihan sungguhan.
- Pengeluaran hari ini = Rp125.000 contoh + pengeluaran bertanggal hari ini.
- Anggaran kategori mengikuti batas yang dibuat pengguna dan pengeluaran bulan berjalan pada kategori terkait, tanpa pengeluaran contoh.
- Urungkan membatalkan catatan terakhir yang baru disimpan dan memperbarui ringkasan. Daftar menampilkan lima catatan terbaru.

Tidak ada migrasi database atau perubahan kebijakan akses untuk versi ini. Integrasi Supabase selanjutnya memerlukan kepemilikan transaksi per pengguna, kategori, rekening, serta kebijakan RLS sebelum dipakai menyimpan catatan.

Tes fitur berada di test/unit/notes.test.ts dan test/e2e/notes.spec.ts. Tes browser memakai autentikasi tiruan, tanpa membuat akun atau mengubah data Supabase.

Saldo contoh dibagi menjadi Tunai Rp450.000, Bank Rp6.500.000, E-Wallet Rp1.500.000, dan Tabungan Rp0 (total Rp8.450.000). Pilihan Bayar dari/Masuk ke menampilkan saldo masing-masing berdasarkan catatan akun di browser. Pengeluaran melebihi saldo sumber yang dipilih tidak dapat disimpan; nominal tepat sebesar saldo diperbolehkan. Pemasukan tetap dapat dicatat meskipun saldo sumber kosong. Pemeriksaan menggunakan saldo saat ini, termasuk catatan bertanggal lampau.

Foto struk bersifat opsional (satu foto per catatan). Pilih berkas atau gunakan tombol Ambil foto; kamera langsung dibuka di dalam browser, dengan kamera belakang diprioritaskan pada HP. Pengguna mengizinkan akses kamera lalu menekan Jepret foto. Kamera dimatikan setelah foto diambil, panel ditutup, atau halaman disembunyikan. Akses kamera memerlukan HTTPS (atau localhost pada komputer yang sama); HTTP melalui alamat IP lokal di HP tidak dapat memakai kamera browser. JPG, PNG, dan WebP maksimal 10 MB diterima, diperkecil hingga sisi terpanjang 2400 piksel dan dikompresi sebagai JPEG sebelum disimpan bersama catatan. Pratinjau muncul otomatis, dapat diperbesar, diganti, atau dihapus sebelum menyimpan. Catatan yang memiliki foto menyediakan tombol Lihat struk. Foto juga disimpan hanya di browser per akun, mengikuti batas kapasitas penyimpanan browser; jika penyimpanan gagal, isian dan foto tetap tersedia untuk dicoba ulang atau disimpan tanpa foto. Fitur ini tidak melakukan OCR.


## Syarat anggaran untuk pengeluaran

Pengeluaran hanya dapat disimpan jika akun memiliki anggaran untuk kategori dan bulan tanggal transaksi yang dipilih. Tanpa anggaran yang sesuai, tombol simpan dinonaktifkan dan form mengarahkan pengguna ke menu Anggaran. Pemasukan tetap dapat dicatat tanpa anggaran. Ketentuan ini juga berlaku saat menyimpan perubahan pengeluaran atau mengubah pemasukan menjadi pengeluaran. Catatan lama tanpa anggaran tetap terlihat dan dapat dihapus; sebelum mengubahnya menjadi/menyimpan pengeluaran, atur anggaran yang sesuai.

Penyimpanan memeriksa ulang anggaran terbaru per akun. Anggaran yang tidak dapat dibaca atau berubah saat form terbuka tidak boleh membuat pengeluaran tersimpan tanpa validasi; isian tetap tersedia ketika penyimpanan ditolak. Melewati batas nominal anggaran tetap berupa peringatan selama saldo dompet cukup.

## Anggaran (versi awal)

Menu Anggaran membuka halaman /anggaran. Pilih bulan kalender, buat batas per kategori, lalu buka kategori untuk melihat pengeluaran, mengubah batas, atau mencatat pengeluaran dengan kategori dan periode terisi. Periode mendatang dapat direncanakan; catatan pengeluarannya baru tersedia saat periode dimulai. Satu kategori hanya memiliki satu batas per bulan; belum ada pengulangan otomatis atau penghapusan anggaran.

Ringkasan menghitung kategori yang memiliki anggaran; pengeluaran tanpa anggaran ditampilkan terpisah. Pengeluaran mengikuti tanggal catatan, dari semua dompet, tanpa pemasukan. Status aman di bawah 75%, mendekati batas mulai 75%, batas tercapai pada 100%, dan terlewati di atas 100%. Melewati anggaran memberi peringatan pada form catatan, tetapi tidak memblokir transaksi selama saldo dompet cukup. Urungkan catatan memperbarui anggaran kembali. Batas anggaran tidak memindahkan uang atau mengurangi saldo/dana contoh yang disisihkan di Beranda.

Data batas disimpan per akun pada localStorage (dompet-santai-budgets-v1:<id akun>), mengikuti keterbatasan penyimpanan catatan: belum tersinkron antarperangkat dan hilang jika data situs dihapus. Kegagalan penyimpanan mempertahankan isian, dan data yang tidak dapat dibaca tidak ditimpa otomatis. Tema terang/gelap dan navigasi desktop/HP mengikuti tampilan aplikasi.


## Kategori tambahan

Tombol Tambah Kategori tersedia pada form Buat Anggaran dan Tambah Catatan. Isi nama 1-32 karakter dan pilih ikon; kategori langsung tersimpan dan terpilih tanpa menghapus isian anggaran/catatan. Nama duplikat dalam jenis yang sama ditolak, termasuk nama kategori bawaan, dengan mengabaikan besar/kecil huruf dan spasi berlebih.

Kategori pengeluaran digunakan bersama oleh anggaran dan catatan; kategori pemasukan hanya tersedia untuk pemasukan. Kategori tersimpan per akun pada localStorage dengan kunci dompet-santai-categories-v1:<id akun>, mengikuti keterbatasan penyimpanan lokal yang sama. Membatalkan form catatan/anggaran tidak menghapus kategori yang sudah disimpan. Belum ada edit atau hapus kategori. Catatan lama dan kategori bawaan tetap kompatibel. Kegagalan penyimpanan kategori mempertahankan isian untuk dicoba kembali.

## Dompet default untuk anggaran

Pada form Buat/Ubah Anggaran, pilihan opsional Biasanya bayar dari menyimpan dompet default untuk kategori dan bulan tersebut. Pilihan menampilkan saldo dompet yang tersedia. Dompet juga ditampilkan pada kartu dan detail anggaran; pengaturan ini tidak memindahkan atau mengurangi uang.

Form Tambah Catatan memilih dompet sesuai anggaran kategori pada bulan tanggal transaksi, termasuk ketika dibuka dari Catat Pengeluaran. Jika belum ada pilihan atau dompet tidak tersedia, sumber memakai dompet terakhir yang tersedia (atau dompet pertama); dompet default yang tidak tersedia disertai penjelasan. Sumber dapat diganti secara manual, dan pilihan manual dipertahankan selama draft itu diisi, termasuk saat kategori/tanggal diubah. Membuka catatan baru kembali menerapkan aturan default. Pemasukan tidak memakai default anggaran pengeluaran.

Pengeluaran mengurangi anggaran kategori dan saldo sumber yang dipilih pada catatan. Pengeluaran melebihi saldo tidak dapat disimpan, sedangkan melewati anggaran tetap berupa peringatan. Anggaran lama tanpa default tetap kompatibel; pilihan dapat diubah atau dikosongkan lewat Ubah Anggaran, tanpa mengubah catatan yang sudah ada.

## Riwayat

Menu /riwayat menampilkan catatan asli yang tersimpan per akun di browser. Periode awal adalah bulan ini; tersedia bulan sebelumnya, semua tanggal, dan rentang tanggal inklusif sampai hari ini. Pencarian keterangan/nama kategori digabungkan dengan filter jenis, dompet, dan kategori (termasuk kategori tambahan). Ringkasan pemasukan, pengeluaran, serta selisih selalu dihitung dari seluruh hasil filter; selisih bukan saldo dompet. Daftar diurutkan berdasarkan tanggal transaksi terbaru, lalu waktu pembuatan, dan dikelompokkan per tanggal. Daftar memuat 50 baris awal dan dapat diperluas sampai semua hasil tampil.

Detail dibuka sebagai dialog sehingga filter dan posisi scroll daftar tetap terjaga. Detail memperlihatkan dompet aktual, tanggal, keterangan, dan struk yang dapat diperbesar. Ubah Catatan mengisi seluruh nilai lama, termasuk dompet dan struk; default dompet anggaran tidak menggantikan dompet yang tersimpan. Penggantian struk dan penghapusannya didukung melalui form yang sama. Membatalkan perubahan mempertahankan catatan lama.

Ubah/hapus membaca penyimpanan terbaru, memeriksa apakah transaksi masih sama, kemudian menghitung saldo semua dompet setelah penggantian/penghapusan. Pengeluaran lama tidak dihitung dua kali. Perubahan yang menghasilkan saldo negatif diblokir, termasuk menghapus, mengurangi, atau memindahkan pemasukan yang sudah dibelanjakan. Validasi yang sama berlaku pada Urungkan. Saldo memakai saldo awal contoh yang sudah ada dan seluruh catatan sampai hari ini; ini belum validasi saldo historis per hari. Anggaran dihitung ulang dari kategori dan tanggal hasil perubahan. Hapus memerlukan konfirmasi transaksi dan menghapus struk terkait. Kegagalan penyimpanan atau konflik perubahan tidak menghasilkan pesan sukses dan tidak menimpa transaksi terbaru.

Data tetap menggunakan penyimpanan lokal per akun, belum tersinkron antarperangkat. Tes Riwayat ada di test/unit/history.test.ts dan test/e2e/history.spec.ts; autentikasi browser ditirukan tanpa menulis ke Supabase.
