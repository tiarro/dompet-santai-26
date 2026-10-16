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

## Database

Jalankan tiga migrasi Supabase secara berurutan: supabase/migrations/20260810000000_create_transactions.sql untuk skema prototipe lama, supabase/migrations/20261008000000_create_finance_cloud_storage.sql untuk skema keuangan utama dan RPC snapshot, serta supabase/migrations/20261008000001_create_receipts_storage.sql untuk bucket struk privat. Setelah itu, useCloudFinance() menjadi sumber data utama aplikasi.


## Supabase sebagai penyimpanan utama

Setelah migrasi diterapkan, aplikasi menggunakan Supabase sebagai sumber utama untuk profil onboarding, pengaturan, dompet, kategori, catatan transaksi, anggaran, target tabungan, perpindahan tabungan, dan foto struk. replace_finance_snapshot mengganti seluruh snapshot milik pengguna secara atomik dan menghapus baris lama yang sudah tidak ada dalam payload. get_finance_snapshot memuat data akun setelah navigasi atau saat jendela kembali fokus.

Buka Pengaturan > Simpan ke Supabase untuk melihat jumlah data localStorage lama sebelum migrasi. Tombol migrasi memindahkan catatan, struk, anggaran, kategori, target, transfer, dan pengaturan; data browser asal tetap ada sebagai cadangan. Migrasi membutuhkan koneksi internet dan dapat diulang.

Jangan menaruh SUPABASE_SECRET_KEY pada NUXT_PUBLIC_* atau kode app/. Secret key hanya dipakai endpoint server yang membutuhkannya. Uji RLS dengan dua akun sebelum memakai database produksi: setiap akun hanya boleh membaca dan menulis baris miliknya sendiri.

## PWA online-first

Proyek memiliki konfigurasi PWA dan service worker untuk precache aset serta fallback offline.html. Instalasi produksi masih perlu diverifikasi. Saat aplikasi sudah terbuka dan data akun telah dimuat, transaksi baru dapat disimpan di IndexedDB dengan status **Menunggu sinkronisasi**, lalu divalidasi dan dikirim setelah internet kembali. Saldo resmi berubah setelah server menerima transaksi. Snapshot cloud tidak dicache, sehingga membuka ulang aplikasi sepenuhnya offline belum didukung. Lihat [alur transaksi offline](docs/offline-transactions.md). Foto kamera pada alamat LAN HTTP mengikuti batasan browser dan biasanya memerlukan HTTPS atau localhost.
## Test

```powershell
npm run test:unit
npm run test:e2e
```

Struktur proyek mengikuti [Nuxt Directory Structure](https://nuxt.com/docs/4.x/directory-structure): kode UI berada dalam `app/`, API Nitro dalam `server/`, kontrak bersama dalam `shared/`, dan test dalam `test/`.

## Tambah Catatan (versi awal)

Tombol Tambah Catatan membuka modal desktop atau panel bawah di HP, mengikuti tema terang/gelap dashboard. Pengguna memilih pengeluaran/pemasukan, nominal rupiah bulat, kategori, rekening, tanggal sampai hari ini, dan keterangan opsional. Isian yang belum disimpan dikonfirmasi sebelum dibuang.

Catatan aktif disimpan di Supabase melalui RPC snapshot dan RLS per akun. Data localStorage lama tetap dapat dibaca sebagai sumber migrasi satu kali; buka Pengaturan, tinjau jumlahnya, lalu pilih Migrasikan Data Browser. Setelah migrasi, perubahan dari perangkat lain dimuat ulang saat navigasi atau aplikasi kembali fokus. Pilihan rekening disimpan dalam data cloud akun. Rekening terakhir dipakai kembali jika masih tersedia.

Dashboard masih berupa pratinjau dengan saldo awal dan ringkasan harian contoh:
- Saldo = total saldo awal di Pengaturan + pemasukan tercatat - pengeluaran tercatat. Bawaan awal Rp8.450.000 masih berupa contoh.
- Uang Aman Dipakai = saldo tersebut - dana target tabungan - saldo Tabungan lama yang belum dialokasikan. Ini belum memperhitungkan kewajiban/tagihan.
- Pengeluaran hari ini = Rp125.000 contoh + pengeluaran bertanggal hari ini.
- Anggaran kategori mengikuti batas yang dibuat pengguna dan pengeluaran bulan berjalan pada kategori terkait, tanpa pengeluaran contoh.
- Urungkan membatalkan catatan terakhir yang baru disimpan dan memperbarui ringkasan. Daftar menampilkan lima catatan terbaru.

Migrasi keuangan membuat profil, pengaturan, dompet, kategori, transaksi, anggaran, target, perpindahan tabungan, dan penanda migrasi. Semua tabel keuangan memakai RLS berdasarkan auth.uid(), sedangkan fungsi snapshot hanya dapat dipanggil pengguna terautentikasi.

Tes fitur berada di test/unit/notes.test.ts dan test/e2e/notes.spec.ts. Tes browser memakai autentikasi tiruan, tanpa membuat akun atau mengubah data Supabase.

Saldo contoh dibagi menjadi Tunai Rp450.000, Bank Rp6.500.000, E-Wallet Rp1.500.000, dan Tabungan Rp0 (total Rp8.450.000). Pilihan Bayar dari/Masuk ke menampilkan saldo masing-masing berdasarkan catatan akun di browser. Pengeluaran melebihi saldo sumber yang dipilih tidak dapat disimpan; nominal tepat sebesar saldo diperbolehkan. Pemasukan tetap dapat dicatat meskipun saldo sumber kosong. Pemeriksaan menggunakan saldo saat ini, termasuk catatan bertanggal lampau.

Foto struk bersifat opsional (satu foto per catatan). Pilih berkas atau gunakan tombol Ambil foto; kamera langsung dibuka di dalam browser, dengan kamera belakang diprioritaskan pada HP. Pengguna mengizinkan akses kamera lalu menekan Jepret foto. Kamera dimatikan setelah foto diambil, panel ditutup, atau halaman disembunyikan. Akses kamera memerlukan HTTPS (atau localhost pada komputer yang sama); HTTP melalui alamat IP lokal di HP tidak dapat memakai kamera browser. JPG, PNG, dan WebP maksimal 10 MB diterima, diperkecil hingga sisi terpanjang 2400 piksel dan dikompresi sebagai JPEG sebelum disimpan bersama catatan. Pratinjau muncul otomatis, dapat diperbesar, diganti, atau dihapus sebelum menyimpan. Catatan yang memiliki foto menyediakan tombol Lihat struk. Foto dikompresi sebagai JPEG lalu disimpan di bucket Supabase Storage receipts yang privat dengan path berawalan ID akun. Jika unggahan gagal, isian tetap tersedia untuk dicoba ulang. Fitur ini tidak melakukan OCR.


## Syarat anggaran untuk pengeluaran

Pengeluaran hanya dapat disimpan jika akun memiliki anggaran untuk kategori dan bulan tanggal transaksi yang dipilih. Tanpa anggaran yang sesuai, tombol simpan dinonaktifkan dan form mengarahkan pengguna ke menu Anggaran. Pemasukan tetap dapat dicatat tanpa anggaran. Ketentuan ini juga berlaku saat menyimpan perubahan pengeluaran atau mengubah pemasukan menjadi pengeluaran. Catatan lama tanpa anggaran tetap terlihat dan dapat dihapus; sebelum mengubahnya menjadi/menyimpan pengeluaran, atur anggaran yang sesuai.

Penyimpanan memeriksa ulang anggaran terbaru per akun. Anggaran yang tidak dapat dibaca atau berubah saat form terbuka tidak boleh membuat pengeluaran tersimpan tanpa validasi; isian tetap tersedia ketika penyimpanan ditolak. Melewati batas nominal anggaran tetap berupa peringatan selama saldo dompet cukup.

## Anggaran (versi awal)

Menu Anggaran membuka halaman /anggaran. Pilih bulan kalender, buat batas per kategori, lalu buka kategori untuk melihat pengeluaran, mengubah batas, atau mencatat pengeluaran dengan kategori dan periode terisi. Periode mendatang dapat direncanakan; catatan pengeluarannya baru tersedia saat periode dimulai. Satu kategori hanya memiliki satu batas per bulan; belum ada pengulangan otomatis atau penghapusan anggaran.

Ringkasan menghitung kategori yang memiliki anggaran; pengeluaran tanpa anggaran ditampilkan terpisah. Pengeluaran mengikuti tanggal catatan, dari semua dompet, tanpa pemasukan. Status aman di bawah 75%, mendekati batas mulai 75%, batas tercapai pada 100%, dan terlewati di atas 100%. Melewati anggaran memberi peringatan pada form catatan, tetapi tidak memblokir transaksi selama saldo dompet cukup. Urungkan catatan memperbarui anggaran kembali. Batas anggaran tidak memindahkan uang atau mengurangi saldo maupun dana tabungan di Beranda.

Batas anggaran tersimpan di Supabase bersama data akun dan dimuat ulang saat aplikasi bernavigasi atau kembali fokus. Data localStorage lama dapat dipindahkan melalui kartu migrasi di Pengaturan. Tema terang/gelap dan navigasi desktop/HP mengikuti tampilan aplikasi.


## Kategori tambahan

Tombol Tambah Kategori tersedia pada form Buat Anggaran dan Tambah Catatan. Isi nama 1-32 karakter dan pilih ikon; kategori langsung tersimpan dan terpilih tanpa menghapus isian anggaran/catatan. Nama duplikat dalam jenis yang sama ditolak, termasuk nama kategori bawaan, dengan mengabaikan besar/kecil huruf dan spasi berlebih.

Kategori pengeluaran digunakan bersama oleh anggaran dan catatan; kategori pemasukan hanya tersedia untuk pemasukan. Kategori tambahan tersimpan di Supabase bersama data akun dan dilindungi RLS. Data localStorage lama ikut dipindahkan oleh migrasi dari Pengaturan. Membatalkan form catatan/anggaran tidak menghapus kategori yang sudah disimpan. Kategori tambahan dapat diubah dan diarsipkan melalui Pengaturan; belum ada penghapusan permanen kategori. Catatan lama dan kategori bawaan tetap kompatibel. Kegagalan penyimpanan kategori mempertahankan isian untuk dicoba kembali.

## Dompet default untuk anggaran

Saat membuat atau mengubah anggaran dengan dompet default, batas anggaran tidak boleh melebihi saldo dompet tersebut saat ini. Tombol Simpan Anggaran dinonaktifkan dan alasan ditampilkan jika saldo kurang; batas yang sama dengan saldo diperbolehkan. Mengubah batas atau dompet langsung memperbarui validasi. Tanpa pilihan default, pemeriksaan saldo dompet ini tidak berlaku. Penyimpanan memeriksa ulang saldo dari catatan terbaru per akun untuk menangani perubahan di tab lain. Pemeriksaan dilakukan per anggaran, tanpa menjumlahkan alokasi anggaran lain atau mengurangi saldo.

Pada form Buat/Ubah Anggaran, pilihan opsional Biasanya bayar dari menyimpan dompet default untuk kategori dan bulan tersebut. Pilihan menampilkan saldo dompet yang tersedia. Dompet juga ditampilkan pada kartu dan detail anggaran; pengaturan ini tidak memindahkan atau mengurangi uang.

Pada Tambah Catatan pengeluaran, Bayar dari otomatis mengikuti dan terkunci pada dompet anggaran kategori untuk bulan tanggal transaksi, termasuk saat dibuka dari Catat Pengeluaran. Mengubah kategori atau tanggal menerapkan dompet anggaran yang sesuai, meskipun sebelumnya pengguna memilih dompet secara manual. Jika dompet anggaran tidak tersedia, penyimpanan diblokir sampai pengaturan anggaran diperbaiki. Penyimpanan memeriksa ulang dompet pada anggaran terbaru sebelum mencatat pengeluaran.

Pengecualian kategori Lainnya: pengguna bebas memilih Tunai, Bank, atau E-Wallet, termasuk jika anggarannya memiliki dompet default. Pilihan manual tetap dipakai selama mengisi kategori Lainnya. Anggaran tanpa dompet default memakai dompet terakhir yang tersedia (atau dompet pertama) dan tetap dapat dipilih manual. Pemasukan dan pengeditan catatan lama mempertahankan perilaku pilihan dompet sebelumnya.

Pengeluaran mengurangi anggaran kategori dan saldo sumber yang dipilih pada catatan. Pengeluaran melebihi saldo tidak dapat disimpan, sedangkan melewati anggaran tetap berupa peringatan. Anggaran lama tanpa default tetap kompatibel; pilihan dapat diubah atau dikosongkan lewat Ubah Anggaran, tanpa mengubah catatan yang sudah ada.

## Tabungan

Menu /tabungan menyediakan target bernama dengan ikon, nominal, tenggat opsional, serta pengingat tanggal bulanan. Target bisa diubah, diarsipkan ketika tercapai, dan diaktifkan kembali. Progres, sisa target, estimasi setoran bulanan, serta kartu Beranda dihitung dari setoran dan penarikan yang benar-benar tercatat. Pengingat tampil di dalam aplikasi mulai tanggal pilihan sampai ada setoran pada bulan tersebut; tanggal 29–31 mengikuti hari terakhir bulan yang lebih pendek. Tidak ada notifikasi latar belakang atau transfer bank otomatis.

Tambah Tabungan memindahkan dana dari Tunai, Bank, atau E-Wallet ke satu target. Tarik Dana memindahkan dana target ke dompet pilihan setelah konfirmasi. Nominal harus rupiah bulat positif; setoran maksimal saldo sumber dan penarikan maksimal dana target. Tanggal transfer adalah hari pencatatan. Transfer tidak menambah pemasukan, pengeluaran, atau pemakaian anggaran. Total uang tetap sama. Dana satu transfer hanya dimiliki satu target; dana target tidak dapat dibelanjakan melalui catatan biasa. Edit, hapus, dan Urungkan catatan juga memeriksa saldo setelah transfer sehingga pemasukan yang sudah ditabung tidak bisa dibatalkan jika membuat saldo negatif.

Target berisi dana tidak dapat dihapus: tarik dahulu seluruh dana ke dompet. Penghapusan target kosong mempertahankan riwayatnya. Target arsip tetap menyisihkan dana dan mempertahankan riwayat; aktifkan kembali untuk menarik atau menambah dana. Target boleh menerima dana di atas nominal tujuan; progres visual dibatasi 100%, nominal asli tetap ditampilkan.

Target dan transfer tabungan tersimpan di Supabase bersama transaksi dan dompet. Penyimpanan baru menampilkan hasil setelah RPC berhasil; RLS membatasi setiap akun pada datanya sendiri. Data localStorage lama dipindahkan melalui migrasi yang dapat diulang dari Pengaturan.

Saldo awal dompet mengikuti Pengaturan, dengan bawaan contoh yang didokumentasikan di atas. Uang Aman Dipakai kini mengurangi dana tabungan aktual, termasuk target arsip dan saldo Tabungan lama; belum memperhitungkan tagihan. Riwayat transfer ada di menu Tabungan, sedangkan Riwayat transaksi tetap khusus pemasukan/pengeluaran. Tes fitur: test/unit/savings.test.ts dan test/e2e/savings.spec.ts.

## Riwayat

Menu /riwayat menampilkan catatan asli yang tersimpan per akun di Supabase. Periode awal adalah bulan ini; tersedia bulan sebelumnya, semua tanggal, dan rentang tanggal inklusif sampai hari ini. Pencarian keterangan/nama kategori digabungkan dengan filter jenis, dompet, dan kategori (termasuk kategori tambahan). Ringkasan pemasukan, pengeluaran, serta selisih selalu dihitung dari seluruh hasil filter; selisih bukan saldo dompet. Daftar diurutkan berdasarkan tanggal transaksi terbaru, lalu waktu pembuatan, dan dikelompokkan per tanggal. Daftar memuat 50 baris awal dan dapat diperluas sampai semua hasil tampil.

Detail dibuka sebagai dialog sehingga filter dan posisi scroll daftar tetap terjaga. Detail memperlihatkan dompet aktual, tanggal, keterangan, dan struk yang dapat diperbesar. Ubah Catatan mengisi seluruh nilai lama, termasuk dompet dan struk; default dompet anggaran tidak menggantikan dompet yang tersimpan. Penggantian struk dan penghapusannya didukung melalui form yang sama. Membatalkan perubahan mempertahankan catatan lama.

Ubah/hapus membaca penyimpanan terbaru, memeriksa apakah transaksi masih sama, kemudian menghitung saldo semua dompet setelah penggantian/penghapusan. Pengeluaran lama tidak dihitung dua kali. Perubahan yang menghasilkan saldo negatif diblokir, termasuk menghapus, mengurangi, atau memindahkan pemasukan yang sudah dibelanjakan. Validasi yang sama berlaku pada Urungkan. Saldo memakai saldo awal dari Pengaturan dan seluruh catatan sampai hari ini; ini belum validasi saldo historis per hari. Anggaran dihitung ulang dari kategori dan tanggal hasil perubahan. Hapus memerlukan konfirmasi transaksi dan menghapus struk terkait. Kegagalan penyimpanan atau konflik perubahan tidak menghasilkan pesan sukses dan tidak menimpa transaksi terbaru.

Data Riwayat berasal dari Supabase sehingga dapat dilihat lintas perangkat setelah login. Tes Riwayat ada di test/unit/history.test.ts dan test/e2e/history.spec.ts; autentikasi browser ditirukan tanpa menulis ke Supabase.

## Pengaturan

Menu /pengaturan tersedia dari navigasi HP dan desktop. Profil menampilkan email dan memungkinkan perubahan nama panggilan melalui Supabase Auth; metadata ini hanya untuk tampilan, bukan otorisasi. Keluar Akun memakai scope local, mengakhiri sesi browser ini tanpa menghapus data keuangan atau mengeluarkan perangkat lain. Perubahan profil memerlukan koneksi.

Dompet Tunai, Bank, dan E-Wallet memiliki saldo awal yang dapat diatur dalam rupiah bulat nonnegatif. Saldo awal bukan pemasukan. Semua pemeriksaan catatan (termasuk edit/hapus/Urungkan), anggaran, transfer tabungan, dan ringkasan dashboard memakai saldo tersebut. Perubahan yang menyebabkan saldo tersedia negatif ditolak. Dompet yang masih bersaldo atau terhubung ke anggaran tidak dapat dinonaktifkan; riwayat dompet kosong tetap disimpan. Pilihan Tabungan lama mengatur ketersediaan dompet tersebut untuk catatan, terpisah dari dana target yang tetap terlindungi.

Tema terang, gelap, atau mengikuti perangkat disimpan per akun. Mode sistem mengikuti perubahan preferensi perangkat selama aplikasi dibuka. Pengingat mencatat muncul setelah waktu pilihan jika belum ada catatan hari ini. Pengingat menabung dapat dimatikan secara global; jadwal per target tetap tersimpan. Keduanya hanya tampil dalam aplikasi, bukan push atau notifikasi latar belakang. Mata uang tetap IDR dan bahasa tetap Indonesia; periode anggaran tetap bulan kalender.

Kategori tambahan dapat dibuat, diubah nama/ikon, diarsipkan, dan diaktifkan kembali. Arsip menghilangkan kategori dari pilihan catatan/anggaran baru, tanpa menghilangkan riwayat atau anggaran lama. Catatan lama dapat tetap mempertahankan kategorinya saat diedit. Kategori bawaan tidak dapat diubah; tidak ada penghapusan permanen kategori.

Backup JSON maksimal 15 MB memuat catatan beserta struk, anggaran, kategori, target dan transfer tabungan, serta pengaturan. Backup tidak mencakup kata sandi, token sesi, cookie, atau profil Auth. Impor hanya menerima versi yang didukung dan akun yang sama, memeriksa struktur, relasi kategori/target, tanggal, dan konsistensi saldo sebelum meminta konfirmasi penggantian. Preview yang sudah kedaluwarsa akibat perubahan data ditolak. Reset memerlukan mengetik RESET, mengosongkan data keuangan akun aktif dan mengatur saldo awal nol; akun lain serta sesi masuk tetap ada.

Backup lama tetap dapat dibaca untuk migrasi. Backup dan reset sekarang menggunakan snapshot Supabase atomik melalui RPC; preview restore memeriksa fingerprint data cloud sebelum penggantian. Data localStorage lama dipertahankan sampai pengguna memindahkannya secara sadar.

Pengaturan keuangan, tema, saldo awal, dan status dompet tersimpan di Supabase dan tersedia lintas perangkat. Backup JSON tetap berguna sebagai salinan portabel; data browser lama tidak dihapus otomatis. Pengujian tersedia pada test/unit/settings.test.ts dan test/e2e/settings.spec.ts; autentikasi browser ditirukan tanpa mengubah akun nyata.


## Foto profil

Klik foto profil lalu Ubah foto untuk memilih JPG, PNG, atau WebP dari HP/komputer (maksimal 10 MB). Pratinjau dipotong persegi di tengah dan diperkecil menjadi maksimal 512 x 512 piksel; metadata foto tidak ikut disimpan. Foto baru diunggah ketika Simpan Profil ditekan. Batalkan foto mengembalikan foto sebelumnya.

Foto disimpan per akun di bucket Supabase Storage privat `profile-photos`, maksimal 256 KB per JPEG hasil pemrosesan. Endpoint server memverifikasi access token melalui Supabase Auth dan menentukan path berdasarkan ID akun terverifikasi; klien tidak menentukan ID pemilik atau path. Foto tidak dimasukkan ke JWT atau metadata Auth. Nama, bio, dan gender tetap disimpan melalui Auth; jika unggah foto gagal setelah isian tersimpan, foto dapat dicoba kembali.

Server memerlukan `SUPABASE_SECRET_KEY` di `.env` serta URL Supabase yang sama dengan Auth. Jangan mengekspos secret key dengan awalan `NUXT_PUBLIC_`. Bucket privat dibuat otomatis saat unggahan pertama bila belum ada, tanpa kebijakan akses klien. Foto dibaca melalui endpoint terautentikasi dengan respons `private, no-store`. Restart server setelah mengubah `.env`. Deployment memerlukan server Nuxt/Nitro, bukan hosting HTML statis saja.
