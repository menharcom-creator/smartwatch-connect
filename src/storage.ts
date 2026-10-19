import AsyncStorage from '@react-native-async-storage/async-storage';
import { HrRecord, Settings } from './types';

const K = { hr: 'swc.hr', set: 'swc.settings', sync: 'swc.lastSync' };
export const defaultSettings: Settings = { theme: 'auto', goal: 8000, units: 'km' };

async function get<T>(k: string, fallback: T): Promise<T> {
  try { const v = await AsyncStorage.getItem(k); return v ? (JSON.parse(v) as T) : fallback; }
  catch { return fallback; }
}

export const loadSettings = async (): Promise<Settings> => ({ ...defaultSettings, ...(await get<Partial<Settings>>(K.set, {})) });
export const saveSettings = (s: Settings) => AsyncStorage.setItem(K.set, JSON.stringify(s));
export const loadHr = () => get<HrRecord[]>(K.hr, []);
export const loadLastSync = () => get<number | null>(K.sync, null);
export const setLastSync = (t: number) => AsyncStorage.setItem(K.sync, JSON.stringify(t));

export { addHr } from './hr';
export const saveHr = (l: HrRecord[]) => AsyncStorage.setItem(K.hr, JSON.stringify(l));
export const wipeAll = () => AsyncStorage.multiRemove(Object.values(K));
