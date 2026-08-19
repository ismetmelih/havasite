# TürkiyeCanlı — Hava Durumu, Deprem &amp; Yangın Takip Paneli

Türkiye için canlı hava durumu, deprem ve (uydu tabanlı) yangın tespiti verilerini
tek bir animasyonlu panelde gösteren, tamamen yerel çalışan bir web sitesi.

## Kurulum ve çalıştırma

Gereksinim: [Node.js](https://nodejs.org) 18 veya üzeri (bilgisayarında zaten **Node v22** kurulu görünüyor).

```bash
cd havasite
npm start
```

Sonra tarayıcında **http://localhost:3000** adresini aç.

Bağımlılık kurmana gerek yok — sunucu sadece Node'un yerleşik modüllerini kullanır.
Harita (Leaflet) ve 3D arka plan (Three.js) kütüphaneleri sayfalarda CDN üzerinden
otomatik yüklenir; internet bağlantısı gerekir.

## Sayfalar

| Sayfa | Açıklama |
|---|---|
| `index.html` | Ana sayfa — 3D animasyonlu hero, canlı özet şerit, 3 kategori kartı |
| `login.html` | Animasyonlu/3D giriş-kayıt ekranı (bkz. aşağıdaki not) |
| `hava.html` | Anlık hava durumu, saatlik/7 günlük tahmin, 81 illik sıcaklık haritası |
| `deprem.html` | Canlı deprem haritası, filtreler, son depremler listesi |
| `yangin.html` | NASA FIRMS uydu verisiyle canlı yangın/aktif ateş haritası |

## Yangın verisi için NASA FIRMS anahtarı

Yangın sayfasının gerçek veri gösterebilmesi için ücretsiz bir API anahtarı gerekir:

1. https://firms.modaps.eosdis.nasa.gov/api/map_key/ adresine git, e-posta adresinle ücretsiz anahtar iste (anında e-postana gelir).
2. `config.json` dosyasını aç, `FIRMS_MAP_KEY` alanına anahtarını yapıştır.
3. Sunucuyu yeniden başlat (`npm start`).

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

## Giriş sistemi hakkında not

`login.html` sayfasındaki giriş/kayıt akışı **demo amaçlıdır**: gerçek bir kimlik
doğrulama sunucusu veya veritabanı yoktur. Girilen ad/e-posta yalnızca tarayıcının
`localStorage`'ında saklanır ve hiçbir yere gönderilmez. Gerçek kullanıcı hesapları
gerekiyorsa bir kimlik doğrulama servisi (ör. kendi backend'in + veritabanı, veya
Auth0/Firebase Auth gibi bir servis) entegre edilmesi gerekir.

## Render.com'da canlıya alma

Bu proje ek bağımlılık ve build adımı gerektirmediği için Render'ın ücretsiz
**Web Service** planında doğrudan çalışır.

1. Bu repoyu GitHub'a push et (zaten yapıldıysa atla).
2. [render.com](https://render.com) üzerinde hesabınla GitHub'ı bağla.
3. **New +** → **Blueprint** ile bu reponun kökündeki `render.yaml` dosyasını seçtir
   (ya da **New +** → **Web Service** ile manuel oluştur: *Build Command* boş/`echo ok`,
   *Start Command* `node server.js`).
4. Render panelinde **Environment** sekmesinden `FIRMS_MAP_KEY` değişkenini ekle
   (`config.json` `.gitignore`'da olduğu için sunucuya taşınmaz; anahtar buradan okunur).
5. Deploy tamamlanınca Render'ın verdiği `https://<servis-adi>.onrender.com` adresinden sitene ulaşırsın.

> Not: Ücretsiz plan bir süre trafik almazsa "uykuya" geçer; ilk istekte birkaç
> saniye gecikme olabilir.

## Proje yapısı

```
havasite/
  server.js          # statik dosya sunucusu + /api/quakes ve /api/fires proxy'leri
  config.json         # NASA FIRMS anahtarı (git'e dahil edilmez)
  public/
    index.html, login.html, hava.html, deprem.html, yangin.html
    css/               # base.css (ortak) + sayfa bazlı stiller
    js/                # main.js (ortak), three-bg.js (3D), weather.js, quake.js, fire.js, ...
```
