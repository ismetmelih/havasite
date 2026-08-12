// Turkiye'nin 30 buyuk sehri (il merkezi koordinatlari).
// Hava durumu coklu-sehir haritasi ve deprem/yangin en-yakin-sehir eslestirmesi icin kullanilir.
window.TR_CITIES = [
  { name: "İstanbul", lat: 41.0082, lon: 28.9784 },
  { name: "Ankara", lat: 39.9208, lon: 32.8541 },
  { name: "İzmir", lat: 38.4237, lon: 27.1428 },
  { name: "Bursa", lat: 40.1885, lon: 29.0610 },
  { name: "Antalya", lat: 36.8969, lon: 30.7133 },
  { name: "Adana", lat: 37.0000, lon: 35.3213 },
  { name: "Konya", lat: 37.8746, lon: 32.4932 },
  { name: "Gaziantep", lat: 37.0662, lon: 37.3833 },
  { name: "Mersin", lat: 36.8000, lon: 34.6333 },
  { name: "Diyarbakır", lat: 37.9144, lon: 40.2306 },
  { name: "Kayseri", lat: 38.7312, lon: 35.4787 },
  { name: "Eskişehir", lat: 39.7767, lon: 30.5206 },
  { name: "Samsun", lat: 41.2867, lon: 36.3300 },
  { name: "Denizli", lat: 37.7765, lon: 29.0864 },
  { name: "Malatya", lat: 38.3552, lon: 38.3095 },
  { name: "Erzurum", lat: 39.9000, lon: 41.2700 },
  { name: "Van", lat: 38.4891, lon: 43.4089 },
  { name: "Trabzon", lat: 41.0027, lon: 39.7168 },
  { name: "Şanlıurfa", lat: 37.1591, lon: 38.7969 },
  { name: "Kocaeli", lat: 40.8533, lon: 29.8815 },
  { name: "Muğla", lat: 37.2153, lon: 28.3636 },
  { name: "Aydın", lat: 37.8560, lon: 27.8416 },
  { name: "Balıkesir", lat: 39.6484, lon: 27.8826 },
  { name: "Manisa", lat: 38.6191, lon: 27.4289 },
  { name: "Hatay", lat: 36.2025, lon: 36.1600 },
  { name: "Sivas", lat: 39.7477, lon: 37.0179 },
  { name: "Elazığ", lat: 38.6810, lon: 39.2264 },
  { name: "Rize", lat: 41.0201, lon: 40.5234 },
  { name: "Edirne", lat: 41.6771, lon: 26.5557 },
  { name: "Çanakkale", lat: 40.1553, lon: 26.4142 },
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
