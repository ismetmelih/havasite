// Afet arsivi: Turkiye'de yasanan buyuk deprem, sel ve orman yangini felaketleri.
// Rakamlar resmi aciklamalar ve kaynak gosterilen yayinlardan alinmistir; kaynaklar arasinda
// fark varsa metinde belirtilir. Metinler duz yazidir (HTML degil); sayfada kacirilarak basilir.
// type: deprem | sel | yangin   ·   il: ilgili il sayfalari (ad, TR_CITIES ile ayni yazim)

const ARSIV = [
  {
    slug: "1939-erzincan-depremi",
    type: "deprem",
    title: "1939 Erzincan Depremi",
    date: "1939-12-27",
    dateText: "27 Aralık 1939",
    place: "Erzincan",
    lat: 39.77, lon: 39.53,
    il: ["Erzincan"],
    summary: "Kuzey Anadolu Fayı'nın yaklaşık 360 kilometrelik bölümünü kıran, kış gecesi gelen ve 20. yüzyılda Türkiye'de en ağır can kaybına yol açan doğal afet.",
    facts: [
      ["Tarih", "27 Aralık 1939, gece yarısından sonra"],
      ["Büyüklük", "Mw 7,8 (bazı kaynaklarda 7,9)"],
      ["Fay", "Kuzey Anadolu Fayı, yaklaşık 360 km yüzey kırığı"],
      ["Can kaybı", "32.968 (kaynaklara göre 32.700–32.968)"],
      ["Hasar", "Yaklaşık 116 bin bina yıkıldı ya da hasar gördü"],
    ],
    body: [
      "27 Aralık 1939 gecesi Erzincan, Türkiye'de aletlerle ölçülmüş en güçlü depremlerden biriyle sarsıldı. Moment büyüklüğü 7,8 olarak kabul edilen deprem, Kuzey Anadolu Fayı'nın yaklaşık 360 kilometrelik bir bölümünü kırdı; fay boyunca yatayda 3,7 metreye varan kayma oluştu.",
      "Deprem kışın en sert günlerinde, insanlar uykudayken geldi. Kentteki binaların neredeyse tamamı yıkıldı. Sıcaklığın −30 °C'ye kadar düştüğü bildirilen günlerde enkazdan sağ çıkanların bir kısmı da soğuk nedeniyle hayatını kaybetti. Kayıtlarda en sık geçen can kaybı 32.968'dir; bu, 20. yüzyılda Türkiye'de bir doğal afette yaşanan en ağır kayıptır.",
      "Erzincan depremi, Kuzey Anadolu Fayı üzerinde doğudan batıya doğru ilerleyen bir deprem dizisinin başlangıcı sayılır. Sonraki 60 yıl içinde fayın farklı parçalarında büyük depremler yaşandı; bu dizinin batıdaki en yıkıcı halkalarından biri 1999 Gölcük depremi oldu.",
    ],
    lessons: [
      "Erzincan ve onu izleyen 1942–1944 depremlerinin ardından, 1944'te 4623 sayılı kanunla depreme karşı alınacak önlemler ilk kez kapsamlı bir yasal düzenlemeye bağlandı.",
      "1945'te Türkiye'nin ilk deprem bölgeleri haritası yürürlüğe girdi; harita sonraki yıllarda defalarca yenilendi.",
    ],
    sources: [
      ["Wikipedia: 1939 Erzincan earthquake", "https://en.wikipedia.org/wiki/1939_Erzincan_earthquake"],
      ["Anadolu Ajansı: Son 123 yılın en büyük depremleri", "https://aa.com.tr/en/turkiye/last-123-years-largest-earthquakes-in-turkiye/2836533"],
      ["JMO: Türkiye deprem bölgeleri haritalarının tarihçesi", "https://www.jmo.org.tr/resimler/ekler/3a4b9ef2f4d1118_ek.pdf"],
    ],
  },
  {
    slug: "1999-golcuk-marmara-depremi",
    type: "deprem",
    title: "17 Ağustos 1999 Gölcük (Marmara) Depremi",
    date: "1999-08-17",
    dateText: "17 Ağustos 1999",
    place: "Gölcük, Kocaeli",
    lat: 40.75, lon: 29.86,
    il: ["Kocaeli", "Sakarya", "Yalova", "İstanbul", "Düzce", "Bolu"],
    summary: "Gece saat 03.02'de yaklaşık 45 saniye süren, Marmara Bölgesi'nin sanayi kalbini vuran ve Türkiye'nin afet yönetimini kökten değiştiren deprem.",
    facts: [
      ["Tarih", "17 Ağustos 1999, saat 03.02"],
      ["Büyüklük", "7,4 (genel kabul gören değer)"],
      ["Süre", "Yaklaşık 45 saniye"],
      ["Fay", "Kuzey Anadolu Fayı'nın Marmara (İzmit) bölümü"],
      ["Can kaybı", "Resmî rakam 17.480; 2010 TBMM araştırma raporunda 18.373"],
      ["Yaralı", "43.953"],
    ],
    body: [
      "17 Ağustos 1999 gecesi saat 03.02'de Kocaeli'nin Gölcük ilçesi merkezli deprem, Kuzey Anadolu Fayı'nın Marmara bölümünü kırdı. Yaklaşık 45 saniye süren sarsıntı Kocaeli, Sakarya, Yalova ve İstanbul başta olmak üzere geniş bir bölgede büyük yıkıma yol açtı.",
      "Depremin büyüklüğü bugün genel olarak 7,4 kabul edilir. Resmî can kaybı 17.480 olarak açıklandı; 2010'da yayımlanan TBMM araştırma raporunda bu sayı 18.373 olarak güncellendi. İzmit'teki rafineride deprem sonrası çıkan yangın günlerce sürdü.",
      "Aynı yılın 12 Kasım'ında Düzce'de yaşanan 7,2 büyüklüğündeki deprem, bölgenin acısını derinleştirdi. İki deprem, Kuzey Anadolu Fayı'nın batıya ilerleyen deprem dizisinin bir parçası olarak değerlendirilir.",
    ],
    lessons: [
      "2000 yılında zorunlu deprem sigortası (DASK) uygulaması başladı.",
      "2001'de 4708 sayılı Yapı Denetimi Kanunu çıkarıldı.",
      "Dağınık afet kurumları 2009'da Afet ve Acil Durum Yönetimi Başkanlığı (AFAD) çatısı altında birleştirildi.",
      "Gönüllü arama-kurtarma ekiplerinin önemi bu depremle geniş kitlelerce fark edildi.",
    ],
    sources: [
      ["Sözcü: 17 Ağustos 1999 Marmara depremi", "https://www.sozcu.com.tr/17-agustos-1999-marmara-depremi-neler-yasandi-kac-kisi-hayatini-kaybetti-wp7775219"],
      ["Milliyet: 17 Ağustos depremi bilgileri", "https://milliyet.com.tr/bilgi-rehberi/17-agustos-depremi-saat-kacta-nerede-oldu-17-agustos-1999-marmara-depremi-izmit-golcuk-kac-saniye-surdu-6808324"],
      ["Wikipedia: 1999 İzmit earthquake", "https://en.wikipedia.org/wiki/1999_%C4%B0zmit_earthquake"],
    ],
  },
  {
    slug: "2011-van-depremi",
    type: "deprem",
    title: "2011 Van Depremleri",
    date: "2011-10-23",
    dateText: "23 Ekim 2011",
    place: "Tabanlı, Van",
    lat: 38.72, lon: 43.41,
    il: ["Van"],
    summary: "Erciş ve Van merkezde ağır yıkıma yol açan 23 Ekim depremi ve 17 gün sonra Edremit'te yaşanan ikinci deprem.",
    facts: [
      ["Tarih", "23 Ekim 2011, saat 13.41"],
      ["Büyüklük", "Mw 7,2 (AFAD ölçümü 7,0)"],
      ["Merkez", "Van'a bağlı Tabanlı köyü"],
      ["İkinci deprem", "9 Kasım 2011, Edremit merkezli, 5,6"],
      ["Can kaybı", "644 (23 Ekim: 604, 9 Kasım: 40 — AFAD)"],
    ],
    body: [
      "23 Ekim 2011 Pazar günü saat 13.41'de, Van'a bağlı Tabanlı köyü merkezli deprem kenti sarstı. Farklı kurumların ölçümleri 7,0 ile 7,3 arasında değişse de büyüklüğü genel olarak 7,2 kabul edilir. En ağır yıkım Erciş ilçesinde ve Van kent merkezinde yaşandı.",
      "Kurtarma ve barınma çalışmaları sürerken, 9 Kasım 2011'de Edremit merkezli 5,6 büyüklüğünde ikinci bir deprem oldu. İlk depremde hasar gören bazı binalar, aralarında yardım için bölgede bulunanların kaldığı bir otelin de olduğu yapılar, bu ikinci sarsıntıda çöktü.",
      "AFAD verilerine göre 23 Ekim depreminde 604, 9 Kasım depreminde 40 kişi hayatını kaybetti; toplam can kaybı 644 oldu. Kışın yaklaştığı bölgede on binlerce kişi çadır ve konteyner kentlerde barındırıldı.",
    ],
    lessons: [
      "Hasarlı binalara erken dönülmesinin tehlikesi Edremit depremiyle acı biçimde görüldü; hasar tespiti bitmeden binaya girilmemelidir.",
      "2012'de çıkarılan 6306 sayılı Afet Riski Altındaki Alanların Dönüştürülmesi Hakkında Kanun ile riskli yapıların yenilenmesi (kentsel dönüşüm) yasal çerçeveye kavuştu.",
    ],
    sources: [
      ["Hürriyet: İki depremde 644 ölü", "https://www.hurriyet.com.tr/gundem/iki-depremde-644-olu-19232729"],
      ["ODTÜ Deprem Mühendisliği: Van depremi saha gözlemleri", "https://eerc.metu.edu.tr/en/system/files/23_ekim_2011_mw_7_2_van_depremi_sismik_ve_yapisal_hasara_iliskin_saha_gozlemleri.pdf"],
      ["Boğaziçi Üniversitesi: October 23, 2011 Van Earthquake", "https://eqe.bogazici.edu.tr/en/pages/october-23-2011-van-earthquake/3944"],
    ],
  },
  {
    slug: "2023-kahramanmaras-depremleri",
    type: "deprem",
    title: "6 Şubat 2023 Kahramanmaraş Depremleri",
    date: "2023-02-06",
    dateText: "6 Şubat 2023",
    place: "Pazarcık ve Elbistan, Kahramanmaraş",
    lat: 37.29, lon: 37.04,
    il: ["Kahramanmaraş", "Hatay", "Gaziantep", "Adıyaman", "Malatya", "Osmaniye", "Adana", "Diyarbakır", "Şanlıurfa", "Kilis", "Elazığ"],
    summary: "Dokuz saat arayla gelen iki büyük depremle 11 ili etkileyen, Cumhuriyet tarihinin en ağır afeti.",
    facts: [
      ["Birinci deprem", "6 Şubat 2023, 04.17 · Pazarcık · 7,7"],
      ["İkinci deprem", "6 Şubat 2023, 13.24 · Elbistan · 7,6"],
      ["Etkilenen iller", "Kahramanmaraş, Hatay, Gaziantep, Adıyaman, Malatya, Osmaniye, Adana, Diyarbakır, Şanlıurfa, Kilis, Elazığ"],
      ["Can kaybı", "50.783 (Nisan 2023 resmî kaydı)"],
      ["Yaralı", "107.204"],
    ],
    body: [
      "6 Şubat 2023 sabahı saat 04.17'de Kahramanmaraş'ın Pazarcık ilçesi merkezli 7,7 büyüklüğünde bir deprem oldu. Aynı gün saat 13.24'te bu kez Elbistan merkezli 7,6 büyüklüğünde ikinci bir deprem geldi. Depremler Doğu Anadolu Fay Zonu ve ona bağlı fayların yüzlerce kilometrelik bölümünü kırdı.",
      "Kahramanmaraş, Hatay, Gaziantep, Adıyaman, Malatya, Osmaniye, Adana, Diyarbakır, Şanlıurfa, Kilis ve Elazığ'da on binlerce bina yıkıldı ya da ağır hasar gördü. Kış koşullarında süren arama-kurtarma çalışmalarına yurt içinden ve dünyanın dört bir yanından ekipler katıldı. Depremler komşu Suriye'de de büyük kayba yol açtı.",
      "Nisan 2023'te açıklanan resmî kayıtlara göre Türkiye'de 50.783 kişi hayatını kaybetti, 107.204 kişi yaralandı. 6 Şubat depremleri, Cumhuriyet tarihinin en ağır afeti olarak kayıtlara geçti.",
    ],
    lessons: [
      "Bina güvenliği, zemin etüdü ve yapı denetimi konuları yeniden gündemin ilk sırasına yerleşti.",
      "Büyük bir depremden saatler sonra ikinci bir büyük depremin gelebileceği görüldü; ilk sarsıntıdan sonra hasarlı binalardan uzak durmak hayati önem taşır.",
      "Deprem çantası, toplanma alanını önceden bilmek ve aile iletişim planı, ilk saatlerde hayat kurtarır.",
    ],
    sources: [
      ["NTV: Can kaybı 50 bin 783'e yükseldi", "https://www.ntv.com.tr/turkiye/kahramanmaras-merkezli-depremlerde-can-kaybi-50-bin-783e-yukseldi,y8gMM7CAlE2ltf8TFbXryQ"],
      ["Capital: Kahramanmaraş merkezli depremlerde son durum", "https://www.capital.com.tr/haberler/tum-haberler/kahramanmaras-merkezli-depremlerde-son-durum"],
      ["TMMOB: Depremin 8. ayına ilişkin rapor", "https://tip.org.tr/wp-content/uploads/2024/06/depremin_8._ayina_iliskin_rapor.pdf"],
    ],
  },
  {
    slug: "2021-bati-karadeniz-selleri",
    type: "sel",
    title: "2021 Batı Karadeniz Selleri",
    date: "2021-08-11",
    dateText: "11 Ağustos 2021",
    place: "Bozkurt, Kastamonu",
    lat: 41.95, lon: 34.01,
    il: ["Kastamonu", "Sinop", "Bartın"],
    summary: "Kastamonu, Sinop ve Bartın'da şiddetli yağışların ardından gelen, Bozkurt ilçesini büyük ölçüde yıkan sel felaketi.",
    facts: [
      ["Tarih", "11 Ağustos 2021"],
      ["Etkilenen yerler", "Kastamonu (Bozkurt, Azdavay, İnebolu, Küre, Pınarbaşı), Sinop (Ayancık), Bartın (Ulus)"],
      ["Can kaybı", "82 (Kastamonu 71, Sinop 10, Bartın 1 — AFAD)"],
      ["Arama-kurtarma", "8.808 personel, 21 helikopter (AFAD)"],
    ],
    body: [
      "11 Ağustos 2021'de Batı Karadeniz'de etkili olan şiddetli yağışlar, Kastamonu, Sinop ve Bartın'da ani sellere yol açtı. En ağır yıkım Kastamonu'nun Bozkurt ilçesinde yaşandı: Ezine Çayı'nın taşmasıyla dere yatağına yakın binalar yıkıldı, köprüler ve yollar kullanılamaz hale geldi.",
      "AFAD'ın açıkladığı son verilere göre selde 82 kişi hayatını kaybetti: Kastamonu'da 71, Sinop'ta 10 ve Bartın'da 1 kişi. Bölgeye binlerce arama-kurtarma personeli, iş makineleri ve helikopterler gönderildi; bini aşkın kişi tahliye edildi.",
      "Sel, Akdeniz ve Ege'deki büyük orman yangınlarıyla aynı günlerde yaşandı; Türkiye aynı hafta hem yangın hem sel felaketiyle mücadele etti.",
    ],
    lessons: [
      "Dere yataklarına ve taşkın alanlarına yapılaşmanın riski yeniden tartışıldı.",
      "Meteorolojinin turuncu ve kırmızı uyarıları ciddiye alınmalı; şiddetli yağışta dere yataklarından, alt geçitlerden ve bodrum katlardan uzak durulmalıdır.",
    ],
    sources: [
      ["BirGün: Sel felaketinde can kaybı 82'ye yükseldi", "https://www.birgun.net/haber/sel-felaketinde-can-kaybi-82-ye-yukseldi-355990"],
      ["Sözcü: 3 ilde 1.307 kişi tahliye edildi", "https://www.sozcu.com.tr/3-ilde-1307-kisi-tahliye-edildi-wp6589712"],
      ["Medyascope: Batı Karadeniz'deki sel felaketi", "https://medyascope.tv/2021/08/16/bati-karadenizdeki-sel-felaketinde-can-kaybi-72ye-yukseldi-sekiz-kisinin-tedavisi-suruyor-bozkurtta-selde-coken-olcer-apartmaninin-muteahhidi-mehmet-o-nun-mal-varligina-tedbir-konuldu/"],
    ],
  },
  {
    slug: "2021-akdeniz-ege-orman-yanginlari",
    type: "yangin",
    title: "2021 Akdeniz ve Ege Orman Yangınları",
    date: "2021-07-28",
    dateText: "28 Temmuz 2021",
    place: "Manavgat, Antalya",
    lat: 36.79, lon: 31.44,
    il: ["Antalya", "Muğla", "Aydın", "Adana", "Osmaniye"],
    summary: "Manavgat'ta başlayıp Ege ve Akdeniz kıyılarına yayılan, Türkiye'de kayıtlara geçen en büyük orman yangını sezonu.",
    facts: [
      ["Başlangıç", "28 Temmuz 2021, Manavgat"],
      ["Manavgat yangını", "10. gününde kontrol altına alındı"],
      ["2021'de yanan alan", "139.503 hektar (OGM; 2020'de 20.971 hektar)"],
      ["Can kaybı", "En az 8 (3 Ağustos 2021 itibarıyla)"],
      ["Etkilenen başlıca yerler", "Manavgat, Marmaris, Milas, Köyceğiz, Bodrum ve diğer kıyı ilçeleri"],
    ],
    body: [
      "28 Temmuz 2021 öğle saatlerinde Antalya'nın Manavgat ilçesinde birkaç noktada başlayan yangın, aşırı sıcak ve kuvvetli rüzgârla kısa sürede yerleşim yerlerine ulaştı. Sonraki günlerde Muğla'nın Marmaris, Milas, Köyceğiz ve Bodrum ilçeleri başta olmak üzere Ege ve Akdeniz kıyılarında onlarca yangın çıktı.",
      "Milas'ta alevler bir termik santralin yakınına kadar ulaştı; santral çevresinde tahliyeler yapıldı. Manavgat yangını 10. gününde kontrol altına alındı. Yangınlarda en az 8 kişi hayatını kaybetti; binlerce kişi evlerinden tahliye edildi, çok sayıda hayvan telef oldu.",
      "Orman Genel Müdürlüğü verilerine göre 2021'de Türkiye'de 139.503 hektar alan yandı; bu, bir önceki yılın yaklaşık altı katıydı ve 2021'i kayıtlardaki en büyük yangın sezonu yaptı.",
    ],
    lessons: [
      "Uzayan sıcak ve kuru dönemlerle birlikte yangın sezonlarının daha tehlikeli hale geldiği görüldü.",
      "Yangınla havadan mücadele kapasitesi ve yerleşim yerlerinin tahliye planları geniş çapta tartışıldı.",
      "Ormanda ve yakınında ateş yakılmamalı, cam ve sigara atılmamalı; duman ya da alev görüldüğünde hemen 177 aranmalıdır.",
    ],
    sources: [
      ["BirGün: OGM raporu, yanan orman alanı altı kat arttı", "https://www.birgun.net/haber/orman-genel-mudurlugu-raporu-yanan-orman-alani-onceki-yila-oranla-alti-kat-artti-378913"],
      ["NTV: Orman yangınlarında son durum", "https://www.ntv.com.tr/turkiye/orman-yanginlarinda-son-durum,TKnGRqG4yEe-JvVxToCJxQ"],
      ["ÇEKÜL Vakfı: Manavgat orman yangınları değerlendirme notları", "https://www.cekulvakfi.org.tr/files/dosyalar-haber/manavgat_orman_yanginlari_degerlendirme_notlari_-_recep_esengil.pdf"],
    ],
  },
];

const TYPES = { deprem: "Deprem", sel: "Sel", yangin: "Orman yangını" };
const bySlug = new Map(ARSIV.map((a) => [a.slug, a]));

module.exports = { ARSIV, TYPES, bySlug };
