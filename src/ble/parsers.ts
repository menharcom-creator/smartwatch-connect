const CH = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

export function b64ToBytes(s: string): number[] {
  const out: number[] = [];
  let buf = 0, bits = 0;
  for (const c of s.replace(/=+$/, '')) {
    const v = CH.indexOf(c);
    if (v < 0) continue;
    buf = (buf << 6) | v;
    bits += 6;
    if (bits >= 8) { bits -= 8; out.push((buf >> bits) & 255); buf &= (1 << bits) - 1; }
  }
  return out;
}

/** Bluetooth SIG Heart Rate Measurement (0x2A37). Returns null for invalid data. */
export function parseHeartRate(bytes: number[]): number | null {
  if (bytes.length < 2) return null;
  const is16 = (bytes[0] & 1) === 1;
  if (is16 && bytes.length < 3) return null;
  const bpm = is16 ? bytes[1] | (bytes[2] << 8) : bytes[1];
  return bpm >= 20 && bpm <= 250 ? bpm : null;
}

/** Battery Level (0x2A19), 0-100. */
export function parseBattery(bytes: number[]): number | null {
  if (bytes.length < 1) return null;
  return bytes[0] >= 0 && bytes[0] <= 100 ? bytes[0] : null;
}
