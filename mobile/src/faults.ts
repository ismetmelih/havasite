// Aktif faylar: GEM Global Active Faults Database (Styron & Pagani 2020, CC BY-SA 4.0;
// Türkiye ve çevresi EMME/SHARE projelerinden). Tür, renk ve açıklamalar.
export type FaultRec = { t: number; r: (number | null)[]; c: number[] };
export const FAULTS = require('./data/faults-ll.json') as FaultRec[];

const TYPES = ['Dextral', 'Sinistral', 'Normal', 'Reverse', 'Dextral-Normal', 'Sinistral-Normal', 'Dextral-Reverse', 'Sinistral-Reverse'];

export type FaultGroup = 'yanal' | 'normal' | 'ters';
export const FAULT_GROUPS: { key: FaultGroup; label: string; color: string; text: string }[] = [
  { key: 'yanal', label: 'Yanal atımlı', color: '#ff5a4e', text: 'İki kaya bloğu birbirine göre yatay kayar. Kuzey Anadolu Fayı (sağ yanal) ve Doğu Anadolu Fayı (sol yanal) bu türdendir; büyük ve yıkıcı depremler üretebilirler.' },
  { key: 'normal', label: 'Normal', color: '#b48cff', text: 'Yer kabuğu gerilir ve bir blok aşağı düşer. Batı Anadolu\'daki Gediz, Büyük Menderes gibi çöküntü ovaları (graben) bu faylarla oluşmuştur.' },
  { key: 'ters', label: 'Ters (bindirme)', color: '#22d3ee', text: 'Yer kabuğu sıkışır ve bir blok diğerinin üzerine çıkar. Türkiye\'de daha çok güneydoğuda, Bitlis-Zagros kuşağında görülür.' },
];
export const groupOf = (t: number): FaultGroup => {
  const name = TYPES[t] || '';
  return name.startsWith('Normal') ? 'normal' : name.startsWith('Reverse') ? 'ters' : 'yanal';
};
export const colorOf = (t: number) => FAULT_GROUPS.find((g) => g.key === groupOf(t))!.color;

const TYPE_TR: Record<string, string> = {
  Dextral: 'Sağ yanal doğrultu atımlı',
  Sinistral: 'Sol yanal doğrultu atımlı',
  Normal: 'Normal fay (açılma)',
  Reverse: 'Ters fay (sıkışma)',
  'Dextral-Normal': 'Sağ yanal, normal bileşenli',
  'Sinistral-Normal': 'Sol yanal, normal bileşenli',
  'Dextral-Reverse': 'Sağ yanal, ters bileşenli',
  'Sinistral-Reverse': 'Sol yanal, ters bileşenli',
};
export const typeLabel = (t: number) => TYPE_TR[TYPES[t]] || 'Aktif fay';

// kayma hızı (mm/yıl): ortalama ve aralık
export function rateLabel(r: (number | null)[]) {
  const [mid, lo, hi] = r;
  if (mid == null) return null;
  const range = lo != null && hi != null && (lo !== mid || hi !== mid) ? ` (${lo}–${hi})` : '';
  return `yılda yaklaşık ${mid} mm${range}`;
}

// ana fay kuşaklarının adları (harita üzerinde yazı)
export const FAULT_NAMES: { name: string; lat: number; lon: number }[] = [
  { name: 'Kuzey Anadolu Fayı', lat: 40.95, lon: 33.6 },
  { name: 'Kuzey Anadolu Fayı', lat: 39.95, lon: 38.6 },
  { name: 'Doğu Anadolu Fayı', lat: 38.3, lon: 38.75 },
  { name: 'Ölü Deniz Fay Zonu', lat: 35.9, lon: 36.15 },
  { name: 'Batı Anadolu grabenleri', lat: 38.15, lon: 28.4 },
  { name: 'Bitlis-Zagros Kuşağı', lat: 38.1, lon: 42.3 },
];

// fay hattını harita koordinatlarına çevir
export const faultCoords = (f: FaultRec) => {
  const out: { latitude: number; longitude: number }[] = [];
  for (let i = 0; i < f.c.length; i += 2) out.push({ latitude: f.c[i], longitude: f.c[i + 1] });
  return out;
};
