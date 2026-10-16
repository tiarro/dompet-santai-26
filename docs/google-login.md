# Login dan register Google

Kedua tombol menggunakan `signInWithOAuth` dan kembali ke `/auth/callback`.
Halaman callback menunggu pertukaran kode PKCE oleh client Supabase Nuxt,
memverifikasi claims sesi, lalu membaca profil berdasarkan ID pengguna.

- Profil dengan `onboarding_completed_at`: dashboard `/`.
- Profil belum ada atau onboarding belum selesai: `/onboarding`.
- Pembacaan profil gagal: tampilkan error dan coba lagi; jangan membuat profil baru.

Supabase menggunakan kembali user untuk identitas Google yang sama. Callback
tidak memanggil `signUp`, insert profil, atau reset data keuangan. Pencocokan
identitas/email dilakukan Supabase, bukan pencarian email dari frontend.

## Konfigurasi cloud yang diperlukan

Pada Supabase Authentication → URL Configuration → Redirect URLs, tambahkan:

```text
http://localhost:3000/auth/callback
http://192.168.196.237:3000/auth/callback
```

Tambahkan juga URL callback dengan origin produksi bila digunakan. Saat alamat
IP LAN berubah, sesuaikan URL di atas. Mulai dan selesaikan login pada origin
yang sama agar cookie PKCE tersedia. URL yang tidak diizinkan dapat diarahkan
Supabase ke Site URL sehingga callback aplikasi tidak dijalankan.

Google Cloud → OAuth Client → Authorized redirect URIs tetap menggunakan:

```text
https://fzgecrtixqllmhpxancs.supabase.co/auth/v1/callback
```

Client ID dan Client Secret di Supabase harus berasal dari OAuth client yang sama.

## Verifikasi

Jalankan `npm run test:e2e -- test/e2e/google-login.spec.ts --workers=1`.
Tes memakai respons Auth/database tiruan untuk memeriksa pertukaran kode,
pengarahan berdasarkan profil, penanganan error, dan tidak adanya penulisan akun.
Login Google sungguhan tetap perlu dicoba setelah Redirect URLs diperbarui.
