// Phase 6 Slice 6.1: how adapters reach their couriers, and the store behind connections, parcels and the credential log.
export const COURIER_FETCH = Symbol('COURIER_FETCH');
export const COURIER_STORE = Symbol('COURIER_STORE');
export const COURIER_CLOCK = Symbol('COURIER_CLOCK');
export const STEADFAST_URL = Symbol('STEADFAST_URL');
// Slice 6.2: who hears of a parcel's news, where messages arrive, and the wait between one night's calls.
export const COURIER_NOTIFIER = Symbol('COURIER_NOTIFIER');
export const COURIER_MESSAGE_ORIGIN = Symbol('COURIER_MESSAGE_ORIGIN');
export const COURIER_PAUSE = Symbol('COURIER_PAUSE');
// Slice 6.3: where Pathao is, and what it wants on the answers to its messages.
export const PATHAO_URL = Symbol('PATHAO_URL');
export const PATHAO_TEST_ANSWER = Symbol('PATHAO_TEST_ANSWER');
// Slice 6.4: where RedX is, couriers' area lists, and Lytro's own tokens for reading them.
export const REDX_URL = Symbol('REDX_URL');
export const COURIER_AREA_STORE = Symbol('COURIER_AREA_STORE');
export const COURIER_AREA_TOKENS = Symbol('COURIER_AREA_TOKENS');
