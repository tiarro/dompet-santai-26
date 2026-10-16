# Catatan menunggu sinkronisasi

Saat pengguna sudah masuk dan data akun telah dimuat, **Tambah Catatan** dapat menyimpan catatan baru ketika internet terputus. Tombol berubah menjadi **Simpan ke Antrean**. Penyimpanan dianggap berhasil hanya setelah transaksi IndexedDB selesai, termasuk foto struk jika dilampirkan.

Jika koneksi gagal ketika menyimpan transaksi yang dimulai online, catatan juga dipindahkan ke antrean dengan UUID yang sama. Penolakan validasi server yang jelas tetap mempertahankan formulir untuk diperbaiki.

Antrean tampil pada kartu **Catatan belum tersinkron**, terpisah dari saldo dan riwayat yang sudah disetujui server. Catatan tertunda tidak menambah pemasukan, mengurangi saldo, atau mengubah anggaran sebelum server menerima transaksi.

- **Menunggu sinkronisasi**: tersimpan di perangkat, belum dikonfirmasi server.
- **Menyinkronkan**: sedang diperiksa dan dikirim.
- **Perlu diperbaiki**: validasi terhadap data terbaru gagal. Alasan ditampilkan; pengguna dapat memperbaiki atau menghapus catatan yang belum dikirim.
- Jika respons pengiriman hilang, catatan tetap tersimpan. Edit/hapus ditahan sampai status pengiriman dapat dipastikan untuk menghindari perubahan pada transaksi yang mungkin sudah masuk ke server.

Sinkronisasi berjalan saat koneksi kembali, akun/data siap, jendela kembali aktif, dan setiap 15 detik selama aplikasi terbuka dan terlihat. Tombol **Sinkronkan sekarang** juga mencoba ulang catatan yang perlu diperbaiki. Saldo, kategori aktif, dompet aktif, anggaran bulan transaksi, dan dompet pembayaran anggaran selalu diperiksa kembali. Catatan yang gagal tidak dihapus.

## Penyimpanan dan integritas

Database IndexedDB `dompet-santai-offline-v1`, store `notes`, menyimpan setiap catatan berdasarkan `<user-id>:<transaction-id>`. Daftar hanya dibaca untuk akun aktif. Logout/pergantian akun tidak menghapus antrean akun sebelumnya. Data tetap berada pada browser/perangkat yang sama; membersihkan data situs dapat menghapus antrean yang belum tersinkron.

Setiap catatan memakai UUID tetap. Sebelum mengirim, aplikasi membaca snapshot terbaru dan memeriksa apakah UUID itu sudah ada. Jika sudah ada, antrean ditutup tanpa menulis ulang. RPC `replace_finance_snapshot` memakai fingerprint snapshot dan penguncian transaksi server yang sudah ada. Konflik dari tab/perangkat lain tidak menimpa snapshot terbaru; antrean mencoba kembali setelah refresh.

Klaim atomik IndexedDB dengan lease dan heartbeat mencegah dua tab mengirim/mengedit antrean yang sama bersamaan. Setelah tab tertutup mendadak, lease kedaluwarsa dalam 90 detik. Request yang mungkin sudah terkirim tetap ditandai sampai hasilnya bisa direkonsiliasi. Data akun diperiksa lagi setelah operasi asynchronous dan sebelum menyimpan ke cloud.

## Batas cakupan

Fitur ini mencakup **penambahan transaksi offline**, bukan pengubahan/penghapusan transaksi cloud secara offline. Snapshot cloud tidak dicache; membuka ulang aplikasi atau login dari keadaan sepenuhnya offline masih memerlukan pengembangan shell PWA/autentikasi offline. Antrean tetap bertahan untuk disinkronkan ketika pengguna membuka kembali aplikasi dengan koneksi. Tidak ada Background Sync ketika aplikasi ditutup.

Backup, restore, dan reset keuangan cloud tidak menyertakan/menghapus antrean lokal ini. Selesaikan atau hapus catatan tertunda sebelum mengganti seluruh data cloud. Tidak ada migrasi SQL baru; server tetap harus memiliki kontrak fingerprint `get_finance_snapshot`/`replace_finance_snapshot` yang telah digunakan aplikasi.

Pengujian: aturan validasi pada `test/unit/pending-notes.test.ts`; skenario `offline transactions` dalam `test/e2e/settings.spec.ts` memeriksa penyimpanan offline, saldo tetap, reconnect, reload, isolasi akun, koreksi, kegagalan IndexedDB, respons pengiriman yang hilang, dua tab bersamaan, foto struk, dan koneksi putus saat penyimpanan online. Browser memakai API simulasi; ini tidak menggantikan uji RPC/RLS/Storage pada Supabase produksi.
