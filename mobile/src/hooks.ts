// Veri yükleme ve cihazda saklanan tercihler
import { useCallback, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export function useData<T>(loader: () => Promise<T>, intervalMs?: number, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  // son basarili yukleme ani: ekranlar "simdi" yerine bunu kullanir (render saf kalsin)
  const [at, setAt] = useState(0);
  const ref = useRef(loader);
  useEffect(() => { ref.current = loader; });
  const load = useCallback(async () => {
    try {
      setData(await ref.current());
      setAt(Date.now());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Bağlantı hatası');
    } finally {
      setLoading(false);
    }
  }, []);
  // deps degisince (orn. secili sehir) veri yeniden yuklenir
  useEffect(() => {
    load();
    if (!intervalMs) return;
    const t = setInterval(load, intervalMs);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load, intervalMs, ...deps]);
  const refresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);
  return { data, error, loading, refreshing, refresh, reload: load, at };
}

/* ---------- tercihler (yalnızca cihazda) ---------- */
export type Place = { name: string; lat: number; lon: number };
export type Contact = { name: string; phone: string };
const K = { place: 'tc_place', contacts: 'tc_contacts', safeMsg: 'tc_safe_msg' };

export const Prefs = {
  async getPlace(): Promise<Place | null> {
    try { const v = await AsyncStorage.getItem(K.place); return v ? JSON.parse(v) : null; } catch { return null; }
  },
  async setPlace(p: Place) { await AsyncStorage.setItem(K.place, JSON.stringify(p)); },
  async getContacts(): Promise<Contact[]> {
    try { const v = await AsyncStorage.getItem(K.contacts); return v ? JSON.parse(v) : []; } catch { return []; }
  },
  async setContacts(c: Contact[]) { await AsyncStorage.setItem(K.contacts, JSON.stringify(c)); },
  async getSafeMsg() { return (await AsyncStorage.getItem(K.safeMsg)) || ''; },
  async setSafeMsg(m: string) { await AsyncStorage.setItem(K.safeMsg, m); },
};
