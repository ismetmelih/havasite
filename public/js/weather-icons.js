// WMO hava kodlarini Turkce etiket + 3D hava ikonuna cevirir.
window.WeatherWMO = (function () {
  const LABELS = {
    0: "Açık", 1: "Az bulutlu", 2: "Parçalı bulutlu", 3: "Kapalı",
    45: "Sisli", 48: "Kırağı sis",
    51: "Hafif çisenti", 53: "Çisenti", 55: "Yoğun çisenti",
    56: "Donan çisenti", 57: "Yoğun donan çisenti",
    61: "Hafif yağmur", 63: "Yağmurlu", 65: "Kuvvetli yağmur",
    66: "Donan yağmur", 67: "Kuvvetli donan yağmur",
    71: "Hafif kar", 73: "Kar yağışlı", 75: "Kuvvetli kar", 77: "Kar taneleri",
    80: "Sağanak yağmur", 81: "Kuvvetli sağanak", 82: "Şiddetli sağanak",
    85: "Kar sağanağı", 86: "Kuvvetli kar sağanağı",
    95: "Gök gürültülü fırtına", 96: "Dolu ile fırtına", 99: "Şiddetli dolulu fırtına",
  };

  function category(code) {
    if ([0, 1].includes(code)) return "clear";
    if (code === 2) return "partly";
    if (code === 3) return "cloudy";
    if ([45, 48].includes(code)) return "fog";
    if ([51, 53, 55, 56, 57].includes(code)) return "drizzle";
    if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return "rain";
    if ([71, 73, 75, 77, 85, 86].includes(code)) return "snow";
    if ([95, 96, 99].includes(code)) return "storm";
    return "cloudy";
  }

  // 3D ikonlar (Microsoft Fluent Emoji, MIT) — img/3d/ altinda yerel olarak sunulur.
  function iconFile(code, isDay) {
    switch (category(code)) {
      case "clear":
        return isDay ? (code === 1 ? "sun-small-cloud" : "sun") : "moon";
      case "partly":
        return isDay ? "sun-cloud" : "cloud";
      case "fog":
      case "cloudy":
        return "cloud";
      case "drizzle":
        return isDay ? "sun-rain" : "rain";
      case "rain":
        return "rain";
      case "snow":
        return "snow";
      case "storm":
        return "storm";
    }
    return "cloud";
  }

  // Adi tarihsel sebeple "svg"; artik 3D ikon <img> dondurur.
  function svg(code, isDay = true) {
    const cat = category(code);
    const file = iconFile(code, isDay);
    return `<img class="wi wi-3d wi-${cat} ${isDay ? "wi-day" : "wi-night"}" src="img/3d/${file}.png" alt="${label(code)}" decoding="async" draggable="false" />`;
  }

  function label(code) {
    return LABELS[code] || "Bilinmiyor";
  }

  return { svg, label, category };
})();
