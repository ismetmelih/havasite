// Turkiye'nin 81 ili (il merkezi koordinatlari).
// Hava durumu coklu-sehir haritasi ve deprem/yangin en-yakin-il eslestirmesi icin kullanilir.
window.TR_CITIES = [
  { name: "Adana", lat: 37.0000, lon: 35.3213 },
  { name: "Adıyaman", lat: 37.7648, lon: 38.2786 },
  { name: "Afyonkarahisar", lat: 38.7507, lon: 30.5567 },
  { name: "Ağrı", lat: 39.7191, lon: 43.0503 },
  { name: "Amasya", lat: 40.6499, lon: 35.8353 },
  { name: "Ankara", lat: 39.9208, lon: 32.8541 },
  { name: "Antalya", lat: 36.8969, lon: 30.7133 },
  { name: "Artvin", lat: 41.1828, lon: 41.8183 },
  { name: "Aydın", lat: 37.8560, lon: 27.8416 },
  { name: "Balıkesir", lat: 39.6484, lon: 27.8826 },
  { name: "Bilecik", lat: 40.1506, lon: 29.9792 },
  { name: "Bingöl", lat: 38.8855, lon: 40.4966 },
  { name: "Bitlis", lat: 38.4006, lon: 42.1095 },
  { name: "Bolu", lat: 40.5760, lon: 31.5788 },
  { name: "Burdur", lat: 37.7203, lon: 30.2908 },
  { name: "Bursa", lat: 40.1885, lon: 29.0610 },
  { name: "Çanakkale", lat: 40.1553, lon: 26.4142 },
  { name: "Çankırı", lat: 40.6013, lon: 33.6134 },
  { name: "Çorum", lat: 40.5506, lon: 34.9556 },
  { name: "Denizli", lat: 37.7765, lon: 29.0864 },
  { name: "Diyarbakır", lat: 37.9144, lon: 40.2306 },
  { name: "Edirne", lat: 41.6771, lon: 26.5557 },
  { name: "Elazığ", lat: 38.6810, lon: 39.2264 },
  { name: "Erzincan", lat: 39.7500, lon: 39.5000 },
  { name: "Erzurum", lat: 39.9000, lon: 41.2700 },
  { name: "Eskişehir", lat: 39.7767, lon: 30.5206 },
  { name: "Gaziantep", lat: 37.0662, lon: 37.3833 },
  { name: "Giresun", lat: 40.9128, lon: 38.3895 },
  { name: "Gümüşhane", lat: 40.4386, lon: 39.5086 },
  { name: "Hakkari", lat: 37.5744, lon: 43.7408 },
  { name: "Hatay", lat: 36.2025, lon: 36.1600 },
  { name: "Isparta", lat: 37.7648, lon: 30.5566 },
  { name: "Mersin", lat: 36.8000, lon: 34.6333 },
  { name: "İstanbul", lat: 41.0082, lon: 28.9784 },
  { name: "İzmir", lat: 38.4237, lon: 27.1428 },
  { name: "Kars", lat: 40.6013, lon: 43.0975 },
  { name: "Kastamonu", lat: 41.3887, lon: 33.7827 },
  { name: "Kayseri", lat: 38.7312, lon: 35.4787 },
  { name: "Kırklareli", lat: 41.7333, lon: 27.2167 },
  { name: "Kırşehir", lat: 39.1425, lon: 34.1709 },
  { name: "Kocaeli", lat: 40.8533, lon: 29.8815 },
  { name: "Konya", lat: 37.8746, lon: 32.4932 },
  { name: "Kütahya", lat: 39.4242, lon: 29.9833 },
  { name: "Malatya", lat: 38.3552, lon: 38.3095 },
  { name: "Manisa", lat: 38.6191, lon: 27.4289 },
  { name: "Kahramanmaraş", lat: 37.5753, lon: 36.9228 },
  { name: "Mardin", lat: 37.3212, lon: 40.7245 },
  { name: "Muğla", lat: 37.2153, lon: 28.3636 },
  { name: "Muş", lat: 38.9462, lon: 41.7539 },
  { name: "Nevşehir", lat: 38.6939, lon: 34.6857 },
  { name: "Niğde", lat: 37.9667, lon: 34.6833 },
  { name: "Ordu", lat: 40.9839, lon: 37.8764 },
  { name: "Rize", lat: 41.0201, lon: 40.5234 },
  { name: "Sakarya", lat: 40.6940, lon: 30.4358 },
  { name: "Samsun", lat: 41.2867, lon: 36.3300 },
  { name: "Siirt", lat: 37.9333, lon: 41.9500 },
  { name: "Sinop", lat: 42.0231, lon: 35.1531 },
  { name: "Sivas", lat: 39.7477, lon: 37.0179 },
  { name: "Tekirdağ", lat: 40.9833, lon: 27.5167 },
  { name: "Tokat", lat: 40.3167, lon: 36.5500 },
  { name: "Trabzon", lat: 41.0027, lon: 39.7168 },
  { name: "Tunceli", lat: 39.3074, lon: 39.4388 },
  { name: "Şanlıurfa", lat: 37.1591, lon: 38.7969 },
  { name: "Uşak", lat: 38.6823, lon: 29.4082 },
  { name: "Van", lat: 38.4891, lon: 43.4089 },
  { name: "Yozgat", lat: 39.8181, lon: 34.8147 },
  { name: "Zonguldak", lat: 41.4564, lon: 31.7987 },
  { name: "Aksaray", lat: 38.3687, lon: 34.0360 },
  { name: "Bayburt", lat: 40.2552, lon: 40.2249 },
  { name: "Karaman", lat: 37.1759, lon: 33.2287 },
  { name: "Kırıkkale", lat: 39.8468, lon: 33.5153 },
  { name: "Batman", lat: 37.8812, lon: 41.1351 },
  { name: "Şırnak", lat: 37.4187, lon: 42.4918 },
  { name: "Bartın", lat: 41.6344, lon: 32.3375 },
  { name: "Ardahan", lat: 41.1105, lon: 42.7022 },
  { name: "Iğdır", lat: 39.9167, lon: 44.0333 },
  { name: "Yalova", lat: 40.6500, lon: 29.2667 },
  { name: "Karabük", lat: 41.2061, lon: 32.6204 },
  { name: "Kilis", lat: 36.7184, lon: 37.1212 },
  { name: "Osmaniye", lat: 37.0742, lon: 36.2478 },
  { name: "Düzce", lat: 40.8438, lon: 31.1565 },
];

// iki koordinat arasi km cinsinden mesafe (haversine)
window.haversineKm = function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
};

window.nearestCity = function nearestCity(lat, lon) {
  let best = null;
  let bestDist = Infinity;
  for (const c of window.TR_CITIES) {
    const d = window.haversineKm(lat, lon, c.lat, c.lon);
    if (d < bestDist) {
      bestDist = d;
      best = c;
    }
  }
  return { city: best, distanceKm: bestDist };
};
