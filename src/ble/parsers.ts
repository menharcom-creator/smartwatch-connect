import { BleManager, Device, State, Subscription } from 'react-native-ble-plx';
import { b64ToBytes, parseBattery, parseHeartRate } from './parsers';
import { Capabilities, FoundDevice } from '../types';

const u = (s: string) => `0000${s}-0000-1000-8000-00805f9b34fb`;
const HR_SVC = u('180d'), HR_CHR = u('2a37'), BAT_SVC = u('180f'), BAT_CHR = u('2a19');

export const log = (...a: unknown[]) => console.log('[BLE]', ...a);

class BluetoothManager {
  private m: BleManager | null = null;
  private dev: Device | null = null;
  private seen = new Map<string, FoundDevice>();

  private get mgr(): BleManager {
    if (!this.m) this.m = new BleManager();
    return this.m;
  }

  onPowerState(cb: (on: boolean) => void): Subscription {
    return this.mgr.onStateChange(s => cb(s === State.PoweredOn), true);
  }

  startScan(onList: (d: FoundDevice[]) => void, onError: (msg: string) => void) {
    this.seen.clear();
    this.mgr.startDeviceScan(null, { allowDuplicates: false }, (err, d) => {
      if (err) { log('scan error', err.message); onError(err.message); return; }
      if (!d) return;
      this.seen.set(d.id, { id: d.id, name: d.name ?? d.localName ?? 'Unnamed device', rssi: d.rssi });
      onList([...this.seen.values()].sort((a, b) => (b.rssi ?? -999) - (a.rssi ?? -999)));
    });
  }

  stopScan() { this.mgr.stopDeviceScan(); }

  async connect(id: string, onDrop: () => void): Promise<{ name: string; caps: Capabilities }> {
    this.stopScan();
    const d = await this.mgr.connectToDevice(id, { timeout: 15000 });
    await d.discoverAllServicesAndCharacteristics();
    this.dev = d;
    d.onDisconnected(() => { log('disconnected'); this.dev = null; onDrop(); });
    const svcs = (await d.services()).map(s => s.uuid.toLowerCase());
    const caps: Capabilities = { heartRate: svcs.includes(HR_SVC), battery: svcs.includes(BAT_SVC), services: svcs };
    log('connected', d.name, svcs);
    return { name: d.name ?? 'Unnamed device', caps };
  }

  async readBattery(): Promise<number | null> {
    if (!this.dev) return null;
    try {
      const c = await this.dev.readCharacteristicForService(BAT_SVC, BAT_CHR);
      return c.value ? parseBattery(b64ToBytes(c.value)) : null;
    } catch { return null; }
  }

  subscribeHeartRate(onBpm: (bpm: number) => void, onError: (m: string) => void): Subscription {
    if (!this.dev) throw new Error('Not connected');
    return this.dev.monitorCharacteristicForService(HR_SVC, HR_CHR, (err, c) => {
      if (err) { onError(err.message); return; }
      if (!c?.value) return;
      const bpm = parseHeartRate(b64ToBytes(c.value));
      if (bpm !== null) onBpm(bpm);
    });
  }

  async disconnect() {
    if (this.dev) { const id = this.dev.id; this.dev = null; try { await this.mgr.cancelDeviceConnection(id); } catch {} }
  }
}

export const bluetooth = new BluetoothManager();
