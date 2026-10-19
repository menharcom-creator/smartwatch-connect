import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert, FlatList, Pressable, SafeAreaView, ScrollView, Share, StyleSheet, Switch, Text, TextInput, View,
  useColorScheme,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import type { Subscription } from 'react-native-ble-plx';
import { bluetooth, log } from './src/ble/BluetoothManager';
import {
  addHr, defaultSettings, loadHr, loadLastSync, loadSettings, saveHr, saveSettings, setLastSync, wipeAll,
} from './src/storage';
import { Capabilities, ConnState, FoundDevice, HrRecord, Settings } from './src/types';

type Tab = 'Home' | 'Health' | 'Device' | 'Settings';
const NO_DATA = 'No data available';

const palette = (dark: boolean) => ({
  bg: dark ? '#0A1424' : '#EEF3FB', card: dark ? '#13233D' : '#FFFFFF', ink: dark ? '#EAF1FF' : '#0B1F3A',
  mute: dark ? '#93A5C3' : '#5F6F86', blue: dark ? '#4C8BFF' : '#1E6BFF', sky: dark ? '#1B3159' : '#E3ECFF',
  red: dark ? '#FF6B70' : '#E5484D', line: dark ? '#223A60' : '#DCE4F2',
});
type P = ReturnType<typeof palette>;

export default function App() {
  const sys = useColorScheme();
  const [settings, setSettings] = useState<Settings>(defaultSettings);
  const dark = settings.theme === 'auto' ? sys === 'dark' : settings.theme === 'dark';
  const c = useMemo(() => palette(dark), [dark]);
  const s = useMemo(() => styles(c), [c]);

  const [tab, setTab] = useState<Tab>('Home');
  const [powered, setPowered] = useState(true);
  const [state, setState] = useState<ConnState>('disconnected');
  const [found, setFound] = useState<FoundDevice[]>([]);
  const [name, setName] = useState<string | null>(null);
  const [caps, setCaps] = useState<Capabilities | null>(null);
  const [battery, setBattery] = useState<number | null>(null);
  const [bpm, setBpm] = useState<number | null>(null);
  const [hr, setHr] = useState<HrRecord[]>([]);
  const [lastSync, setSync] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const lastId = useRef<string | null>(null);
  const userDisc = useRef(false);
  const tries = useRef(0);
  const hrSub = useRef<Subscription | null>(null);
  const hrRef = useRef<HrRecord[]>([]);

  useEffect(() => {
    (async () => {
      setSettings(await loadSettings());
      const h = await loadHr(); hrRef.current = h; setHr(h);
      setSync(await loadLastSync());
    })();
    const sub = bluetooth.onPowerState(setPowered);
    return () => sub.remove();
  }, []);

  const onBpm = useCallback((v: number) => {
    setBpm(v);
    hrRef.current = addHr(hrRef.current, v);
    setHr(hrRef.current);
    saveHr(hrRef.current);
  }, []);

  const afterConnect = useCallback(async () => {
    hrSub.current?.remove(); hrSub.current = null;
    setBattery(await bluetooth.readBattery());
    try { hrSub.current = bluetooth.subscribeHeartRate(onBpm, m => setError('Heart-rate stream stopped: ' + m)); }
    catch { /* watch has no standard heart-rate service */ }
    const t = Date.now(); setSync(t); setLastSync(t);
  }, [onBpm]);

  const doConnect = useCallback(async (id: string) => {
    setError(null); setState('connecting'); lastId.current = id; userDisc.current = false;
    try {
      const r = await bluetooth.connect(id, () => {
        hrSub.current?.remove(); hrSub.current = null; setBpm(null); setBattery(null);
        if (userDisc.current || tries.current >= 3) { setState('disconnected'); return; }
        tries.current += 1; setState('reconnecting');
        setTimeout(() => lastId.current && doConnect(lastId.current), 2000 * tries.current);
      });
      tries.current = 0; setName(r.name); setCaps(r.caps); setState('connected');
      if (!r.caps.heartRate)
        setError('This watch does not share heart rate through the standard Bluetooth service. It may use a private protocol that needs its own adapter.');
      await afterConnect();
    } catch (e: any) {
      log('connect failed', e?.message);
      setState('disconnected');
      setError('Could not connect: ' + (e?.message ?? 'unknown error') + '. Keep the watch awake, close to the phone, and unpaired from other apps.');
    }
  }, [afterConnect]);

  const scan = () => {
    setError(null); setFound([]); setState('scanning');
    bluetooth.startScan(setFound, m => { setState('disconnected'); setError('Scan failed: ' + m); });
    setTimeout(() => { bluetooth.stopScan(); setState(p => (p === 'scanning' ? 'disconnected' : p)); }, 12000);
  };
  const stopScan = () => { bluetooth.stopScan(); setState('disconnected'); };
  const disconnect = async () => { userDisc.current = true; await bluetooth.disconnect(); setState('disconnected'); setName(null); setCaps(null); setBpm(null); setBattery(null); };
  const connected = state === 'connected';

  const update = (p: Partial<Settings>) => { const n = { ...settings, ...p }; setSettings(n); saveSettings(n); };
  const exportData = () => Share.share({ message: JSON.stringify({ settings, heartRate: hr, lastSync }, null, 2) });
  const wipe = () => Alert.alert('Delete all data?', 'This removes saved readings and settings from this phone.', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Delete', style: 'destructive', onPress: async () => { await wipeAll(); hrRef.current = []; setHr([]); setSync(null); setSettings(defaultSettings); } },
  ]);

  const statusText = { disconnected: 'Disconnected', scanning: 'Scanning…', connecting: 'Connecting…', connected: 'Connected', reconnecting: 'Reconnecting…' }[state];

  const Card = ({ label, value, color }: { label: string; value?: string | null; color?: string }) => (
    <View style={s.mini}><Text style={s.mute}>{label}</Text>
      {value ? <Text style={[s.big, color ? { color } : null]}>{value}</Text> : <Text style={s.none}>{NO_DATA}</Text>}</View>
  );

  const Home = (
    <ScrollView contentContainerStyle={s.pad}>
      <Text style={s.h1}>SmartWatch Connect</Text>
      <View style={[s.card, { backgroundColor: c.blue }]}>
        <View style={s.row}>
          <View style={{ flex: 1 }}>
            <Text style={[s.big, { color: '#fff' }]} numberOfLines={1}>{name ?? 'No watch connected'}</Text>
            <Text style={{ color: '#DCE9FF' }}>{statusText}</Text>
          </View>
          <Text style={[s.big, { color: '#fff' }]}>{battery !== null ? battery + '%' : '–'}</Text>
        </View>
        <Text style={{ color: '#DCE9FF', marginTop: 8 }}>Last sync: {lastSync ? new Date(lastSync).toLocaleString() : 'Never'}</Text>
        <View style={[s.row, { marginTop: 12, justifyContent: 'flex-start', gap: 10 }]}>
          <Pressable style={s.btnWhite} onPress={connected ? disconnect : () => setTab('Device')}>
            <Text style={{ color: c.blue, fontWeight: '700' }}>{connected ? 'Disconnect' : 'Find my watch'}</Text></Pressable>
          {connected && <Pressable style={s.btnWhite} onPress={afterConnect}><Text style={{ color: c.blue, fontWeight: '700' }}>Sync now</Text></Pressable>}
        </View>
      </View>
      {error && <Text style={s.err}>{error}</Text>}
      <Text style={s.h2}>Today</Text>
      <View style={s.grid}>
        <Card label="Steps" /><Card label="Distance" /><Card label="Calories" /><Card label="Active minutes" />
      </View>
      <View style={s.card}><View style={s.row}><Text style={s.ink}>Daily goal</Text><Text style={s.mute}>{settings.goal.toLocaleString()} steps</Text></View>
        <View style={s.bar}><View style={[s.barFill, { width: '0%' }]} /></View><Text style={[s.mute, { marginTop: 6 }]}>No step data from the watch yet</Text></View>
      <Text style={s.h2}>Health</Text>
      <View style={s.grid}>
        <Card label="Heart rate" value={bpm !== null ? bpm + ' bpm' : null} color={c.red} />
        <Card label="Blood oxygen" /><Card label="Sleep" />
        <Card label="Services found" value={caps ? String(caps.services.length) : null} />
      </View>
    </ScrollView>
  );

  const recent = [...hr].reverse().slice(0, 40);
  const last = hr.slice(-60);
  const mx = Math.max(...last.map(r => r.bpm), 1), mn = Math.min(...last.map(r => r.bpm), 300);
  const Health = (
    <ScrollView contentContainerStyle={s.pad}>
      <Text style={s.h1}>Health</Text>
      <View style={s.card}>
        <Text style={s.ink}>Heart rate history</Text>
        {last.length === 0 ? <Text style={[s.none, { marginTop: 8 }]}>{NO_DATA}</Text> : (
          <>
            <View style={s.chart}>{last.map(r => (
              <View key={r.t} style={{ flex: 1, justifyContent: 'flex-end' }}>
                <View style={{ height: 8 + ((r.bpm - mn) / Math.max(mx - mn, 1)) * 92, backgroundColor: c.red, marginHorizontal: 0.5, borderRadius: 2 }} /></View>))}</View>
            <Text style={s.mute}>Last {last.length} readings · min {Math.min(...last.map(r => r.bpm))} · max {mx}</Text>
          </>)}
      </View>
      <View style={s.card}><Text style={s.ink}>Recent readings</Text>
        {recent.length === 0 ? <Text style={[s.none, { marginTop: 8 }]}>{NO_DATA}</Text> :
          recent.map(r => <Text key={r.t} style={[s.mute, { paddingVertical: 4 }]}>{new Date(r.t).toLocaleTimeString()} — {r.bpm} bpm</Text>)}</View>
      <Text style={s.mute}>Readings come only from your watch. They are not a medical diagnosis.</Text>
    </ScrollView>
  );

  const Device = (
    <View style={s.pad}>
      <Text style={s.h1}>Device</Text>
      {!powered && <Text style={s.err}>Bluetooth is off. Turn it on in Settings, then scan again.</Text>}
      {error && <Text style={s.err}>{error}</Text>}
      {connected ? (
        <View style={s.card}>
          <Text style={s.big}>{name}</Text>
          <Text style={s.mute}>Battery: {battery !== null ? battery + '%' : 'not reported'} · Heart rate: {caps?.heartRate ? 'supported' : 'not found'}</Text>
          <Text style={[s.mute, { marginTop: 8 }]}>Services reported by the watch:</Text>
          {caps?.services.map(x => <Text key={x} style={s.mono}>{x.slice(0, 8)}</Text>)}
          <Pressable style={[s.btn, { marginTop: 12 }]} onPress={disconnect}><Text style={s.btnTxt}>Disconnect</Text></Pressable>
        </View>
      ) : (
        <>
          <Pressable style={[s.btn, !powered && { opacity: 0.5 }]} disabled={!powered || state === 'connecting'} onPress={state === 'scanning' ? stopScan : scan}>
            <Text style={s.btnTxt}>{state === 'scanning' ? 'Stop scanning' : state === 'connecting' ? 'Connecting…' : 'Scan for watches'}</Text></Pressable>
          <FlatList style={{ marginTop: 12 }} data={found} keyExtractor={d => d.id}
            ListEmptyComponent={<Text style={s.mute}>{state === 'scanning' ? 'Looking for nearby devices…' : 'No devices yet. Wake your watch and tap Scan.'}</Text>}
            renderItem={({ item }) => (
              <Pressable style={[s.card, s.row]} onPress={() => doConnect(item.id)}>
                <View style={{ flex: 1 }}><Text style={s.ink}>{item.name}</Text><Text style={s.mute}>Signal {item.rssi ?? '?'} dBm</Text></View>
                <Text style={{ color: c.blue, fontWeight: '700' }}>Connect</Text></Pressable>)} />
        </>)}
    </View>
  );

  const Set = (
    <ScrollView contentContainerStyle={s.pad}>
      <Text style={s.h1}>Settings</Text>
      <View style={s.card}>
        <Text style={s.ink}>Theme</Text>
        <View style={[s.row, { justifyContent: 'flex-start', gap: 8, marginTop: 8 }]}>
          {(['auto', 'light', 'dark'] as const).map(t => (
            <Pressable key={t} onPress={() => update({ theme: t })} style={[s.chip, settings.theme === t && { backgroundColor: c.blue }]}>
              <Text style={{ color: settings.theme === t ? '#fff' : c.blue, fontWeight: '600' }}>{t === 'auto' ? 'Match phone' : t[0].toUpperCase() + t.slice(1)}</Text></Pressable>))}
        </View>
        <Text style={[s.ink, { marginTop: 14 }]}>Daily step goal</Text>
        <TextInput style={s.input} keyboardType="number-pad" defaultValue={String(settings.goal)}
          onEndEditing={e => { const n = parseInt(e.nativeEvent.text, 10); if (n >= 1000) update({ goal: n }); }} />
        <View style={[s.row, { marginTop: 14 }]}><Text style={s.ink}>Use miles</Text>
          <Switch value={settings.units === 'mi'} onValueChange={v => update({ units: v ? 'mi' : 'km' })} /></View>
      </View>
      <View style={s.card}><Text style={s.ink}>Privacy</Text>
        <Text style={[s.mute, { marginVertical: 6 }]}>Everything stays on this phone. Nothing is uploaded.</Text>
        <View style={[s.row, { justifyContent: 'flex-start', gap: 10 }]}>
          <Pressable style={s.chip} onPress={exportData}><Text style={{ color: c.blue, fontWeight: '600' }}>Export data</Text></Pressable>
          <Pressable style={[s.chip, { backgroundColor: c.red }]} onPress={wipe}><Text style={{ color: '#fff', fontWeight: '600' }}>Delete all data</Text></Pressable>
        </View></View>
      <Text style={s.mute}>Not yet in this version: watch-face transfer, alarms on the watch, call/SMS forwarding, workouts. Each needs a verified protocol for your exact watch model.</Text>
    </ScrollView>
  );

  return (
    <SafeAreaView style={s.root}>
      <StatusBar style={dark ? 'light' : 'dark'} />
      <View style={{ flex: 1 }}>{tab === 'Home' ? Home : tab === 'Health' ? Health : tab === 'Device' ? Device : Set}</View>
      <View style={s.nav}>
        {(['Home', 'Health', 'Device', 'Settings'] as Tab[]).map(t => (
          <Pressable key={t} onPress={() => setTab(t)} accessibilityRole="tab" accessibilityState={{ selected: tab === t }}
            style={[s.navBtn, tab === t && { backgroundColor: c.sky }]}>
            <Text style={{ color: tab === t ? c.blue : c.mute, fontWeight: '700' }}>{t}</Text></Pressable>))}
      </View>
    </SafeAreaView>
  );
}

const styles = (c: P) => StyleSheet.create({
  root: { flex: 1, backgroundColor: c.bg }, pad: { padding: 16 },
  h1: { fontSize: 26, fontWeight: '800', color: c.ink, marginVertical: 8 }, h2: { fontSize: 17, fontWeight: '700', color: c.ink, marginTop: 16, marginBottom: 8 },
  card: { backgroundColor: c.card, borderRadius: 22, padding: 16, marginBottom: 12, shadowColor: '#14388C', shadowOpacity: 0.1, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 3 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  mini: { width: '48%', backgroundColor: c.card, borderRadius: 20, padding: 14, marginBottom: 12 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  big: { fontSize: 22, fontWeight: '800', color: c.ink }, ink: { fontSize: 16, fontWeight: '600', color: c.ink },
  mute: { fontSize: 13, color: c.mute }, none: { fontSize: 14, color: c.mute, fontWeight: '500', marginTop: 4 }, mono: { fontSize: 13, color: c.ink, fontFamily: 'Menlo', paddingVertical: 2 },
  err: { backgroundColor: c.sky, color: c.ink, padding: 12, borderRadius: 14, marginVertical: 8, overflow: 'hidden' },
  btn: { backgroundColor: c.blue, borderRadius: 14, padding: 14, alignItems: 'center' }, btnTxt: { color: '#fff', fontWeight: '700', fontSize: 16 },
  btnWhite: { backgroundColor: '#fff', borderRadius: 14, paddingVertical: 10, paddingHorizontal: 16 },
  chip: { backgroundColor: c.sky, borderRadius: 12, paddingVertical: 9, paddingHorizontal: 14 },
  input: { borderWidth: 1, borderColor: c.line, borderRadius: 12, padding: 10, marginTop: 6, color: c.ink, fontSize: 16 },
  bar: { height: 10, borderRadius: 6, backgroundColor: c.sky, marginTop: 8, overflow: 'hidden' }, barFill: { height: '100%', backgroundColor: c.blue },
  chart: { flexDirection: 'row', height: 100, alignItems: 'flex-end', marginVertical: 10 },
  nav: { flexDirection: 'row', justifyContent: 'space-around', padding: 8, backgroundColor: c.card, borderTopWidth: 1, borderTopColor: c.line },
  navBtn: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 12 },
});
