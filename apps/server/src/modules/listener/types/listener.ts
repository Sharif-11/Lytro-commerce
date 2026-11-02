import type { ListenerDeviceStatus, ListenerRevokeReason } from '@lytronix/validators';

/** LSN-02, LSN-20: a listener phone as its shop and the operator see it. */
export interface ListenerDeviceView {
  id: string;
  name: string;
  model: string | null;
  appVersion: string;
  pairedAt: Date;
  lastSeenAt: Date | null;
  /** LSN-03: seen within the offline window (30 minutes). */
  online: boolean;
  status: ListenerDeviceStatus;
  revokedAt: Date | null;
  revokeReason: ListenerRevokeReason | null;
  flags: number;
}

/** LSN-08, LSN-20: the shop's phones, with how many work and how many its plan allows (null: no limit). */
export interface ListenerDeviceList {
  devices: ListenerDeviceView[];
  active: number;
  limit: number | null;
}

/** LSN-01: a pairing code, shown once, and when it runs out. */
export interface ListenerCode {
  code: string;
  expiresAt: Date;
}

/** LSN-01, LSN-11: what the app keeps once paired -- its token, shown this once -- and how often to report. */
export interface ListenerPaired {
  deviceId: string;
  token: string;
  shopName: string;
  heartbeatMinutes: number;
}

/** LSN-03, LSN-24: the app's report answered -- connected, and how often to report again. */
export interface ListenerConnected {
  status: 'connected';
  heartbeatMinutes: number;
  serverTime: Date;
}
