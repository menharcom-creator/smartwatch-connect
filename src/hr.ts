import { HrRecord } from './types';

/** Adds a reading; one record per second, no duplicates. */
export function addHr(list: HrRecord[], bpm: number, now = Date.now()): HrRecord[] {
  const t = Math.floor(now / 1000) * 1000;
  if (list.some(r => r.t === t)) return list;
  const next = [...list, { t, bpm }];
  return next.length > 3000 ? next.slice(-3000) : next;
}
