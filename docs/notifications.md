# Pusat notifikasi

Lonceng membuka pengingat aktif, diurutkan dari yang paling mendesak. Panel mendukung tema terang/gelap, navigasi keyboard, scroll internal, dan maksimal lima item per halaman. Di HP panel muncul dari bawah. Membuka panel tidak otomatis menandai semuanya dibaca; klik item atau gunakan **Tandai semua dibaca**.

- Tagihan: belum lunas dan jatuh tempo maksimal tiga hari ke depan, hari ini, atau terlambat. Satu item per tagihan; perubahan tahap jatuh tempo menandainya belum dibaca lagi. Klik membuka formulir tagihan terkait, tanpa mengubah status atau saldo.
- Anggaran: pengeluaran bulan berjalan mencapai 80%, 100%, atau melebihi batas. Satu item per kategori. Naik tahap menjadi belum dibaca lagi. Klik membuka detail kategori bulan berjalan. Ambang notifikasi 80% terpisah dari indikator kartu anggaran yang sudah menggunakan 75%.
- Tabungan: mengikuti pengaturan pengingat dan tanggal target. Tidak muncul untuk target selesai/diarsipkan/dihapus atau jika sudah ada setoran bulan ini. Klik membuka detail target.
- Catatan: mengikuti jam di Pengaturan, hanya jika belum ada catatan hari ini. Klik membuka Tambah Catatan.

Pengingat dihitung dari data aplikasi yang tersedia, bukan riwayat notifikasi permanen. Kondisi yang selesai menghilang dari daftar aktif. Tanggal/jam diperbarui setiap 30 detik dan saat jendela aktif kembali. Jika sumber data gagal dimuat, panel menampilkan pesan dan tombol coba lagi, tanpa menyatakan semua pengingat sudah kosong.

Status baca disimpan di `localStorage` dengan kunci `dompet-santai-notifications-v1:<user-id>` (maksimal 1.000 penanda). Ini berlaku per akun dan browser, tidak disinkronkan lintas perangkat. Perubahan dari tab lain diterima melalui event storage; jika penyimpanan gagal, penanda tetap berlaku selama sesi dan panel menampilkan keterangan. Tidak ada perubahan skema database atau notifikasi push saat aplikasi ditutup. Tagihan tetap memerlukan tabel pengingat yang sudah digunakan fitur Tagihan Mendatang.

Verifikasi: `test/unit/notifications.test.ts` untuk aturan dan pergantian tahap; skenario `notification` dalam `test/e2e/settings.spec.ts` untuk pagination, navigasi, status baca, akun berbeda, kegagalan penyimpanan, tema, dan layar pendek. Browser menggunakan API simulasi, bukan verifikasi data Supabase produksi.
