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
DATABASE_URL="postgres://kullanici:sifre@host:5432/veritabani" npm start
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
kimse kayıt olarak admin olamaz. Site sahibi Render panelinde (veya yerelde) iki ortam
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

Herhangi bir PostgreSQL bağlantı adresi (`DATABASE_URL` ortam değişkeni) yeterlidir —
Render'ın kendi PostgreSQL'i, [Neon](https://neon.tech), [Supabase](https://supabase.com)
vb. Şema (`users` tablosu) sunucu ilk açıldığında ve her kayıt/girişte otomatik
oluşturulur, elle migration çalıştırmana gerek yok.

> Not: Render'ın ücretsiz PostgreSQL planı belirli bir süre sonra (Render'ın o anki
> koşullarına göre) süresi dolup silinebilir. Kalıcılık önemliyse Neon/Supabase gibi
> süresiz ücretsiz katmanı olan bir sağlayıcı da `DATABASE_URL` olarak kullanılabilir.

## Yangın verisi için NASA FIRMS anahtarı

Yangın sayfasının gerçek veri gösterebilmesi için ücretsiz bir API anahtarı gerekir:

1. https://firms.modaps.eosdis.nasa.gov/api/map_key/ adresine git, e-posta adresinle ücretsiz anahtar iste (anında e-postana gelir).
2. Yerelde: `config.json` dosyasını aç, `FIRMS_MAP_KEY` alanına anahtarını yapıştır ve sunucuyu yeniden başlat.
   Render'da: **Environment** sekmesinden `FIRMS_MAP_KEY` ortam değişkenini ekle.

Anahtar girilmeden önce `yangin.html` sayfası kurulum talimatlarını gösterir ve
istersen **"Örnek veriyle görüntüle"** butonuyla arayüzü örnek (gerçek olmayan,
açıkça etiketlenmiş) verilerle deneyebilirsin.

`config.json` `.gitignore` içinde — anahtarın yanlışlıkla bir depoya gönderilmez.

## Veri kaynakları

- **Hava durumu:** [Open-Meteo](https://open-meteo.com) — anahtarsız, ücretsiz.
- **Deprem:** [Kandilli Rasathanesi](http://www.koeri.boun.edu.tr) verisini yayınlayan
  kamuya açık [api.orhanaydogdu.com.tr](https://api.orhanaydogdu.com.tr/deprem/kandilli/live) servisi — anahtarsız.
- **Yangın:** [NASA FIRMS](https://firms.modaps.eosdis.nasa.gov) (VIIRS/MODIS uydu aktif ateş tespiti) — ücretsiz anahtar gerekir.

Bu proje bağımsız/gayriresmîdir; resmî afet/acil durum kararları için ilgili
resmî kurumların (AFAD, Kandilli, OGM vb.) duyurularını esas al.

## Render.com'da canlıya alma

1. Bu repoyu GitHub'a push et (zaten yapıldıysa atla).
2. [render.com](https://render.com) üzerinde hesabınla GitHub'ı bağla.
3. **New +** → **Blueprint** ile bu reponun kökündeki `render.yaml` dosyasını seçtir.
   Bu dosya hem web servisini hem de ücretsiz bir PostgreSQL veritabanını otomatik
   kurar ve `DATABASE_URL` / `SESSION_SECRET` değişkenlerini otomatik bağlar.
4. Kurulum ekranında `FIRMS_MAP_KEY` (opsiyonel, yangın verisi için) ve `ADMIN_EMAIL` /
   `ADMIN_PASSWORD` (admin paneline giriş için — kendi belirlediğin bilgiler) değerlerini gir.
   Blueprint kurulumunu ilk seferinde yaptıysan, bu değişkenleri sonradan Render panelinde
   servisin **Environment** sekmesinden de ekleyebilir/değiştirebilirsin.
5. Deploy tamamlanınca Render'ın verdiği `https://<servis-adi>.onrender.com`
   adresinden sitene, `/admin.html` adresinden de admin paneline ulaşırsın.

> Not: Ücretsiz web servis planı bir süre trafik almazsa "uykuya" geçer; ilk istekte
> birkaç saniye gecikme olabilir.

## Proje yapısı

```
havasite/
  server.js          # statik dosya sunucusu + /api/quakes, /api/fires, /api/auth/*, /api/admin/* uc noktalari
  lib/
    db.js             # Postgres pool + otomatik sema
    auth.js           # sifre hashleme + imzali oturum cerezi
  config.json         # NASA FIRMS anahtari (git'e dahil edilmez)
  render.yaml          # Render Blueprint: web servis + ucretsiz Postgres
  public/
    index.html, login.html, hava.html, deprem.html, yangin.html, admin.html, ayarlar.html
    css/               # base.css (ortak) + sayfa bazli stiller
    js/                # main.js (ortak/oturum), three-bg.js (3D), weather.js, quake.js, quake-globe.js, fire.js, admin.js, ...
```
