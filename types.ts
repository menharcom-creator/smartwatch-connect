export type ConnState = 'disconnected' | 'scanning' | 'connecting' | 'connected' | 'reconnecting';
export interface HrRecord { t: number; bpm: number }
export interface FoundDevice { id: string; name: string; rssi: number | null }
export interface Settings { theme: 'auto' | 'light' | 'dark'; goal: number; units: 'km' | 'mi' }
export interface Capabilities { heartRate: boolean; battery: boolean; services: string[] }
