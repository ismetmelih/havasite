# TürkiyeCanlı — Hava Durumu, Deprem &amp; Yangın Takip Paneli

Türkiye için canlı hava durumu, deprem ve (uydu tabanlı) yangın tespiti verilerini
tek bir animasyonlu panelde gösteren bir web sitesi. Hava/deprem/yangın panellerini
görmek için hesap oluşturup giriş yapmak gerekir; admin hesapları küçük bir
yönetim paneline (`admin.html`) erişebilir.

## Kurulum ve çalıştırma

Gereksinim: [Node.js](https://nodejs.org) 18+ ve bir PostgreSQL veritabanı bağlantısı
(giriş/kayıt ve admin paneli için — bkz. aşağıdaki "Veritabanı" bölümü).

```bash
cd havasite
npm install
npm start
```

Ayarlar proje kökündeki `.env` dosyasından okunur (`.gitignore` içinde, depoya gönderilmez):

```
DATABASE_URL=postgres://kullanici:sifre@host:5432/veritabani
SESSION_SECRET=uzun-rastgele-bir-deger
ADMIN_EMAIL=admin@ornek.com
ADMIN_PASSWORD=guclu-bir-sifre
FIRMS_MAP_KEY=nasa-firms-anahtari
```

Sonra tarayıcında **http://localhost:3000** adresini aç. `DATABASE_URL` tanımlamazsan
site yine açılır (hava/deprem/yangın verisi ve harita CDN'leri için internet bağlantısı
gerekir) ama giriş/kayıt ve admin paneli "veritabanı yok" mesajı gösterir.

Harita (Leaflet) ve 3D arka plan (Three.js) kütüphaneleri sayfalarda CDN üzerinden
otomatik yüklenir.

## Sayfalar

| Sayfa | Açıklama | Erişim |
|---|---|---|
| `index.html` | Ana sayfa — 3D animasyonlu hero, canlı özet şerit; 3 kategori kartı sadece giriş yapınca görünür | herkese açık |
| `login.html` | Giriş / kayıt ekranı (gerçek sunucu tarafı hesaplar) | herkese açık |
| `hava.html` | Anlık hava durumu, saatlik/7 günlük tahmin, 81 illik sıcaklık haritası + filtreler | **giriş gerekli** |
| `deprem.html` | Canlı deprem haritası, 3D glob (sürükleyerek çevrilebilir), filtreler | **giriş gerekli** |
| `yangin.html` | NASA FIRMS uydu verisiyle canlı yangın haritası, alev animasyonu, filtreler | **giriş gerekli** |
| `admin.html` | Kullanıcı listesi, rol yönetimi, site/servis durumu | **sadece admin** |

## Giriş, kayıt ve admin sistemi

**Müşteri hesapları** (hava/deprem/yangın sayfalarına erişim için) sunucu tarafında
PostgreSQL'de saklanır; şifreler geri döndürülemez şekilde (Node'un yerleşik
`crypto.scrypt`'i ile tuzlanarak) hash'lenir, oturumlar imzalı (HMAC-SHA256) `httpOnly`
bir çerezle yürütülür.

**Admin girişi bundan tamamen ayrıdır** — kayıt formuyla hiçbir ilişkisi yoktur ve
kimse kayıt olarak admin olamaz. Site sahibi AWS Amplify'da (veya yerelde `.env` içinde) iki ortam
değişkeni tanımlar:

- `ADMIN_EMAIL`
- `ADMIN_PASSWORD`

`admin.html` sayfasındaki giriş formu yalnızca bu ikiliyle eşleşen bilgilerle açılır ve
ayrı, 12 saatlik kısa ömürlü bir oturum cerezi (`havasite_admin_session`) kullanır.
Admin panelinden kayıtlı müşteri hesaplarını görüntüleyip silebilirsin.

İlgili API uç noktaları:
- Müşteri: `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/logout`, `GET/PATCH /api/auth/me`
- Admin: `POST /api/admin/login`, `POST /api/admin/logout`, `GET /api/admin/session`, `GET /api/admin/stats`, `GET /api/admin/users`, `DELETE /api/admin/users/:id`

## Veritabanı

Canlı site [Supabase](https://supabase.com) üzerindeki PostgreSQL'i kullanır; ama herhangi
bir PostgreSQL bağlantı adresi (`DATABASE_URL`) yeterlidir. Şema (`users` tablosu) sunucu
ilk açıldığında ve her kayıt/girişte otomatik oluşturulur, elle migration çalıştırmana
gerek yok.

Supabase kullanırken:
- AWS Amplify'dan bağlanmak için **Session pooler** adresini kullan
  (`...pooler.supabase.com:5432`); "Direct connection" adresi IPv6 olduğu için bağlanamayabilir.
- Şifrede `%`, `@`, `#` gibi karakterler varsa adreste URL kodlanmış yazılmalı (`%` → `%25`, `@` → `%40`).
- `users` tablosunu Supabase'in herkese açık Data API'sinden gizli tut: RLS açık olsun ve
  `REVOKE ALL ON TABLE public.users FROM anon, authenticated;` çalıştırılmış olsun.

## Yangın verisi için NASA FIRMS anahtarı

Yangın sayfasının gerçek veri gösterebilmesi için ücretsiz bir API anahtarı gerekir:

1. https://firms.modaps.eosdis.nasa.gov/api/map_key/ adresine git, e-posta adresinle ücretsiz anahtar iste (anında e-postana gelir).
2. Yerelde: `.env` dosyasına `FIRMS_MAP_KEY=...` satırını ekle (veya `config.json` içindeki
   `FIRMS_MAP_KEY` alanına yapıştır) ve sunucuyu yeniden başlat.
   AWS Amplify'da: **Hosting → Environment variables** bölümüne `FIRMS_MAP_KEY` ekle ve **Redeploy** et.

Anahtar girilmeden önce `yangin.html` sayfası kurulum talimatlarını gösterir ve
istersen **"Örnek veriyle görüntüle"** butonuyla arayüzü örnek (gerçek olmayan,
açıkça etiketlenmiş) verilerle deneyebilirsin.

`.env` ve `config.json` `.gitignore` içinde — anahtarın yanlışlıkla bir depoya gönderilmez.

## Uygulama (ana ekrana ekle / PWA)

Site aynı zamanda telefona kurulabilen bir uygulamadır: `manifest.webmanifest`, `sw.js`
(service worker) ve `img/app/` ikonları sayesinde Android'de "Yükle", iPhone'da Safari →
Paylaş → **Ana Ekrana Ekle** ile tam ekran açılır. Service worker sayfaları ve son deprem/yangın
verisini önbelleğe alır; bağlantı yokken son bilinen veri, hiç açılmamış sayfalarda
`offline.html` gösterilir. Önbellek davranışı değiştirildiğinde `sw.js` içindeki `VERSION`
artırılmalı.

İkonlar: 3D ikonlar [Microsoft Fluent Emoji](https://github.com/microsoft/fluentui-emoji)
(MIT, `img/3d/`), arayüz ikonları [Phosphor Icons](https://phosphoricons.com) (MIT, `js/main.js`).

## Veri kaynakları

- **Hava durumu:** [Open-Meteo](https://open-meteo.com) — anahtarsız, ücretsiz.
- **Deprem:** [AFAD](https://deprem.afad.gov.tr) resmi servisi — il/ilçe/mahalle
  seviyesinde detaylı, anahtarsız. AFAD'a ulaşılamazsa otomatik olarak
  [EMSC](https://www.seismicportal.eu) (Avrupa-Akdeniz Sismoloji Merkezi) yedek
  kaynağına geçilir. (Önceki kaynağımız olan Kandilli'nin bağımsız proxy servisi,
  bulut barındırma sağlayıcılarının sunucu IP'lerini engellediği için bırakıldı.)
- **Yangın:** [NASA FIRMS](https://firms.modaps.eosdis.nasa.gov) (VIIRS/MODIS uydu aktif ateş tespiti) — ücretsiz anahtar gerekir.

Bu proje bağımsız/gayriresmîdir; resmî afet/acil durum kararları için ilgili
resmî kurumların (AFAD, Kandilli, OGM vb.) duyurularını esas al.

## AWS Amplify'da canlıya alma

Site [AWS Amplify Hosting](https://aws.amazon.com/amplify/hosting/) üzerinde çalışır;
`main` dalına her push'ta otomatik yeniden yayınlanır. Node sunucusu Amplify'ın
[deployment specification](https://docs.aws.amazon.com/amplify/latest/userguide/deploy-express-server.html)
ile "Compute" olarak, `public/` klasörü ise CDN'den statik olarak sunulur.

İlk kurulum:
1. AWS Konsolu → **Amplify** → **Create new app** → **GitHub** → bu repo, `main` dalı.
2. Build ayarlarını değiştirme; kökteki `amplify.yml` kullanılır.
3. **Environment variables** kısmına `DATABASE_URL`, `SESSION_SECRET`, `ADMIN_EMAIL`,
   `ADMIN_PASSWORD` ve (isteğe bağlı) `FIRMS_MAP_KEY` ekle → **Save and deploy**.

> Önemli: Amplify ortam değişkenleri çalışma anında sunucuya ulaşmaz; `bin/amplify-build.sh`
> bunları build sırasında sunucunun `.env` dosyasına yazar. Bu yüzden bir değişkeni
> ekledikten/değiştirdikten sonra **Redeploy** gerekir.

## Proje yapısı

```
havasite/
  server.js          # statik dosya sunucusu + /api/quakes, /api/fires, /api/auth/*, /api/admin/* uc noktalari
  lib/
    db.js             # Postgres pool + otomatik sema
    auth.js           # sifre hashleme + imzali oturum cerezi
  .env                # yerel ayarlar: DATABASE_URL, ADMIN_*, FIRMS_MAP_KEY (git'e dahil edilmez)
  config.json         # (istege bagli) NASA FIRMS anahtari (git'e dahil edilmez)
  amplify.yml         # AWS Amplify build ayari
  deploy-manifest.json # Amplify: hangi yol sunucuya, hangisi CDN'e gider
  bin/amplify-build.sh # Amplify dagitim paketini (.amplify-hosting) olusturur
  public/
    index.html, login.html, hava.html, deprem.html, yangin.html, admin.html, ayarlar.html
    css/               # base.css (ortak) + sayfa bazli stiller
    js/                # main.js (ortak/oturum), three-bg.js (3D), weather.js, quake.js, quake-globe.js, fire.js, admin.js, ...
```
