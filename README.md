# Randevu Defteri

Ekibin ortak kullandığı müşteri randevu ve takip uygulaması. Her ekip üyesi kendi e-posta ve şifresiyle girer. Herkes aynı randevuları görür ve kimin neyi eklediği kayıtlı kalır.

- **Arayüz:** `index.html` + `app.js` (derleme gerektirmeyen düz HTML/JS)
- **Veritabanı ve giriş:** Supabase
- **Yayın:** Vercel (ya da Netlify veya GitHub Pages; herhangi bir statik barındırma olur)

## Kurulum (bir kez)

### 1. Supabase projesi
1. https://supabase.com adresinde ücretsiz hesap açın ve **New project** ile bir proje oluşturun. Bölge olarak **Frankfurt (eu-central-1)** seçin.
2. Sol menüden **SQL Editor → New query** açın. `supabase/schema.sql` dosyasının içeriğini yapıştırıp **Run** deyin.
3. Aynı yerde `supabase/aktarim.sql` dosyasını çalıştırın. Bu dosya eski claude.ai sayfasındaki 13 randevuyu aktarır. Müşteri telefonlarını içerdiği için GitHub'a gönderilmez.
4. **Authentication → Sign In / Providers → Email** bölümünde **Allow new users to sign up** seçeneğini **kapatın**. Böylece yalnızca sizin davet ettiğiniz kişiler girebilir.
5. **Project Settings → API** sayfasından **Project URL** ve **anon public** anahtarını `config.js` dosyasına yazın.

### 2. Yayınlama (Vercel)
1. https://vercel.com adresinde GitHub hesabınızla giriş yapın.
2. **Add New → Project** ile bu depoyu seçin. Ayar değiştirmeden **Deploy** deyin.
3. Size verilen adresi (ör. `randevu-defteri.vercel.app`) Supabase'de **Authentication → URL Configuration → Site URL** alanına yazın. Davet ve şifre yenileme e-postaları bu adrese yönlendirir.

### 3. Ekibi ekleme
Supabase'de **Authentication → Users → Add user → Send invitation** ile ekip üyesinin e-postasını girin. Kişi gelen bağlantıya tıklar, şifresini belirler ve uygulamayı kullanmaya başlar.

Ekipten ayrılan birinin erişimini kapatmak için aynı ekranda kullanıcıyı silmeniz yeterli.

## Güvenlik notları
- `config.js` içindeki **anon** anahtarının herkese açık olması normaldir. Veriler yalnızca giriş yapmış kullanıcılara açıktır; bu kural `schema.sql` içinde tanımlıdır.
- **service_role** anahtarını hiçbir dosyaya yazmayın.
- Depoyu **Private** (gizli) tutun.
