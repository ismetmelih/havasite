// WMO hava kodu -> Türkçe etiket + 3B ikon (Microsoft Fluent Emoji, MIT)
const LABELS: Record<number, string> = {
  0: 'Açık', 1: 'Az bulutlu', 2: 'Parçalı bulutlu', 3: 'Kapalı', 45: 'Sisli', 48: 'Kırağı sis',
  51: 'Hafif çisenti', 53: 'Çisenti', 55: 'Yoğun çisenti', 56: 'Donan çisenti', 57: 'Yoğun donan çisenti',
  61: 'Hafif yağmur', 63: 'Yağmurlu', 65: 'Kuvvetli yağmur', 66: 'Donan yağmur', 67: 'Kuvvetli donan yağmur',
  71: 'Hafif kar', 73: 'Kar yağışlı', 75: 'Kuvvetli kar', 77: 'Kar taneleri',
  80: 'Sağanak yağmur', 81: 'Kuvvetli sağanak', 82: 'Şiddetli sağanak', 85: 'Kar sağanağı', 86: 'Kuvvetli kar sağanağı',
  95: 'Gök gürültülü fırtına', 96: 'Dolu ile fırtına', 99: 'Şiddetli dolulu fırtına',
};
export const wmoLabel = (code: number) => LABELS[code] || 'Bilinmiyor';

export const ICONS = {
  sun: require('../assets/3d/sun.png'),
  sunSmallCloud: require('../assets/3d/sun-small-cloud.png'),
  sunCloud: require('../assets/3d/sun-cloud.png'),
  sunRain: require('../assets/3d/sun-rain.png'),
  cloud: require('../assets/3d/cloud.png'),
  rain: require('../assets/3d/rain.png'),
  snow: require('../assets/3d/snow.png'),
  storm: require('../assets/3d/storm.png'),
  moon: require('../assets/3d/moon.png'),
  globe: require('../assets/3d/globe.png'),
  fire: require('../assets/3d/fire.png'),
  satellite: require('../assets/3d/satellite.png'),
  siren: require('../assets/3d/siren.png'),
  gear: require('../assets/3d/gear.png'),
  thermometer: require('../assets/3d/thermometer.png'),
  wind: require('../assets/3d/wind.png'),
  droplet: require('../assets/3d/droplet.png'),
  sunrise: require('../assets/3d/sunrise.png'),
};

export function wmoIcon(code: number, isDay = true) {
  if (code === 0) return isDay ? ICONS.sun : ICONS.moon;
  if (code === 1) return isDay ? ICONS.sunSmallCloud : ICONS.moon;
  if (code === 2) return isDay ? ICONS.sunCloud : ICONS.cloud;
  if ([51, 53, 55, 56, 57].includes(code)) return isDay ? ICONS.sunRain : ICONS.rain;
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return ICONS.rain;
  if ([71, 73, 75, 77, 85, 86].includes(code)) return ICONS.snow;
  if ([95, 96, 99].includes(code)) return ICONS.storm;
  return ICONS.cloud;
}
