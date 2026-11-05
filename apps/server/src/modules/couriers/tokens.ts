// Phase 6 Slice 6.1: how adapters reach their couriers, and the store behind connections, parcels and the credential log.
export const COURIER_FETCH = Symbol('COURIER_FETCH');
export const COURIER_STORE = Symbol('COURIER_STORE');
export const COURIER_CLOCK = Symbol('COURIER_CLOCK');
export const STEADFAST_URL = Symbol('STEADFAST_URL');
// Slice 6.2: who hears of a parcel's news, where messages arrive, and the wait between one night's calls.
export const COURIER_NOTIFIER = Symbol('COURIER_NOTIFIER');
export const COURIER_MESSAGE_ORIGIN = Symbol('COURIER_MESSAGE_ORIGIN');
export const COURIER_PAUSE = Symbol('COURIER_PAUSE');
