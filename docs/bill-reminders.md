# Pengingat tagihan

Terapkan seluruh isi `supabase/migrations/20261015100313_create_bill_reminders.sql`
melalui SQL Editor proyek Supabase yang digunakan aplikasi. Migrasi membuat tabel
baru beserta RLS per pengguna dan RPC `complete_bill_reminder`.
Data keuangan lama tidak diubah. Setelah berhasil, klik Muat ulang pada kartu tagihan.

Pengingat mendukung tambah, ubah, hapus, nominal perkiraan, tanggal jatuh tempo,
kategori pengeluaran, dompet referensi, dan pengulangan sekali bayar/bulanan.
Kartu menampilkan maksimal lima data per halaman. Penanda terlambat/hari ini/
dalam tiga hari diperbarui berdasarkan tanggal lokal selama aplikasi terbuka.
Tidak ada push notification, email, atau pembayaran otomatis.

Menandai lunas hanya mengubah status pengingat. RPC tidak menulis transaksi,
anggaran, saldo dompet, maupun tabungan. Untuk tagihan bulanan, satu pengingat
bulan berikutnya dibuat dalam transaksi database yang sama. Tanggal patokan 31
menjadi 28/29 pada Februari, kemudian kembali ke 31 pada Maret. Tagihan tertunggak
maju satu bulan setiap ditandai lunas, tidak melompati bulan yang belum selesai.
Pengingat lunas tetap terlihat pada tab Lunas. Ubah/hapus pengingat berikutnya
untuk mengubah atau menghentikan pengulangan. Menghapus riwayat lunas tidak
menghapus pengingat berikutnya.

Revisi dan kunci baris mencegah penandaan lunas ganda. Jika perangkat lain sudah
mengubah tagihan, muat ulang sebelum mencoba lagi. Dompet/kategori adalah referensi
pengingat; tagihan tidak memesan saldo atau memerlukan anggaran kategori.

Backup, restore dan reset keuangan yang sudah ada hanya mencakup saldo, catatan,
anggaran, tabungan, dan pengaturan. Pengingat tagihan tersimpan terpisah di Supabase
dan tidak ikut direset atau dipulihkan melalui fitur tersebut.
