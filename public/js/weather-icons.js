// WMO hava kodlarini Turkce etiket + animasyonlu SVG ikona cevirir.
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

  const CLOUD = 'M15 42c-6.3 0-11.4-5-11.4-11.3 0-5.6 4.1-10.3 9.6-11.1C14.9 13 21.6 8 29.6 8c9.4 0 17.1 6.9 18.4 15.8 6 .5 10.7 5.6 10.7 11.7 0 6.4-5.3 11.5-11.7 11.5H15Z';

  function sunGroup(cx = 30, cy = 24, r = 9) {
    return `
      <g class="wi-sun">
        <circle cx="${cx}" cy="${cy}" r="${r}" fill="currentColor"/>
        <g stroke="currentColor" stroke-width="3" stroke-linecap="round" class="wi-rays">
          <line x1="${cx}" y1="${cy - r - 7}" x2="${cx}" y2="${cy - r - 2}"/>
          <line x1="${cx}" y1="${cy + r + 2}" x2="${cx}" y2="${cy + r + 7}"/>
          <line x1="${cx - r - 7}" y1="${cy}" x2="${cx - r - 2}" y2="${cy}"/>
          <line x1="${cx + r + 2}" y1="${cy}" x2="${cx + r + 7}" y2="${cy}"/>
          <line x1="${cx - r - 4}" y1="${cy - r - 4}" x2="${cx - r - 1}" y2="${cy - r - 1}"/>
          <line x1="${cx + r + 1}" y1="${cy + r + 1}" x2="${cx + r + 4}" y2="${cy + r + 4}"/>
        </g>
      </g>`;
  }

  function moonGroup(cx = 30, cy = 24, r = 8) {
    return `<path class="wi-moon" fill="currentColor" d="M${cx + 6} ${cy - 9}a10 10 0 1 0 0 18 8 8 0 0 1 0-18Z"/>`;
  }

  function cloudPath(cls = "wi-cloud") {
    return `<path class="${cls}" d="${CLOUD}" fill="currentColor"/>`;
  }

  function rainDrops(n = 4) {
    let out = "";
    for (let i = 0; i < n; i++) {
      const x = 14 + i * 9;
      out += `<line class="wi-drop" style="--d:${i}" x1="${x}" y1="46" x2="${x - 3}" y2="54" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>`;
    }
    return `<g class="wi-rain">${out}</g>`;
  }

  function snowDots(n = 4) {
    let out = "";
    for (let i = 0; i < n; i++) {
      const x = 15 + i * 9;
      out += `<circle class="wi-flake" style="--d:${i}" cx="${x}" cy="48" r="2.1" fill="currentColor"/>`;
    }
    return `<g class="wi-snow">${out}</g>`;
  }

  function bolt() {
    return `<path class="wi-bolt" fill="currentColor" d="M33 38l-9 14h7l-3 9 13-15h-7l4-8Z"/>`;
  }

  function fogLines() {
    return `
      <g class="wi-fog" stroke="currentColor" stroke-width="3" stroke-linecap="round">
        <line class="l1" x1="10" y1="46" x2="42" y2="46"/>
        <line class="l2" x1="16" y1="53" x2="50" y2="53"/>
        <line class="l3" x1="8" y1="39" x2="36" y2="39"/>
      </g>`;
  }

  function svg(code, isDay = true) {
    const cat = category(code);
    let inner = "";
    switch (cat) {
      case "clear":
        inner = isDay ? sunGroup(32, 30, 11) : moonGroup(30, 28, 9);
        break;
      case "partly":
        inner = (isDay ? sunGroup(24, 22, 8) : moonGroup(22, 20, 7)) + cloudPath();
        break;
      case "cloudy":
        inner = `<path class="wi-cloud wi-cloud-back" d="${CLOUD}" fill="currentColor" transform="translate(6,-6) scale(0.8)"/>` + cloudPath();
        break;
      case "fog":
        inner = cloudPath() + fogLines();
        break;
      case "drizzle":
        inner = cloudPath() + rainDrops(3);
        break;
      case "rain":
        inner = cloudPath() + rainDrops(5);
        break;
      case "snow":
        inner = cloudPath() + snowDots(4);
        break;
      case "storm":
        inner = cloudPath() + bolt() + rainDrops(2);
        break;
    }
    return `<svg viewBox="0 0 64 64" class="wi wi-${cat}">${inner}</svg>`;
  }

  function label(code) {
    return LABELS[code] || "Bilinmiyor";
  }

  return { svg, label, category };
})();
