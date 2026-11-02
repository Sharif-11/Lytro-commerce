// LSN-01 to LSN-23: the listener's codes, devices and blocked installations.
export const LISTENER_STORE = Symbol('LISTENER_STORE');
// LSN-12: who tells a shop's owner and Lytro of a phone revoked on its own.
export const LISTENER_NOTIFIER = Symbol('LISTENER_NOTIFIER');
// The listener's clock, so a test may move time.
export const LISTENER_CLOCK = Symbol('LISTENER_CLOCK');
