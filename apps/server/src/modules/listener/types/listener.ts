import type {
  ListenerDeviceStatus,
  ListenerRevokeReason,
  PaymentMethod,
} from '@lytronix/validators';

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
  /** LSN-20 (Slice 5.4b): the messages it sent today, Asia/Dhaka. */
  uploadsToday: number;
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

/** Slice 5.5's sketch: what the app needs on every answer. */
export interface ListenerAppFacts {
  /** The shop's active numbers whose receipts Lytro can read: "is this number's SIM in this phone?". */
  accounts: { method: PaymentMethod; number: string }[];
  /** LSN-16: whose SMS the app lets through. */
  senders: string[];
  /** LSN-04: when test mode ends, while it is on. */
  testModeUntil: Date | null;
}

/** LSN-01, LSN-11: what the app keeps once paired -- its token, shown this once -- and how often to report. */
export interface ListenerPaired extends ListenerAppFacts {
  deviceId: string;
  token: string;
  /** LSN-20: what the shop calls this phone. */
  deviceName: string;
  shopName: string;
  heartbeatMinutes: number;
}

/**
 * LSN-03, LSN-24: the app's report answered -- connected, and how often to report again. Agreed 2026-11-03 (Slice 5.5b's read):
 * the phone's and shop's names too, so a rename on the dashboard reaches the app's menu at its next report.
 */
export interface ListenerConnected extends ListenerAppFacts {
  status: 'connected';
  heartbeatMinutes: number;
  serverTime: Date;
  deviceName: string;
  shopName: string;
}
