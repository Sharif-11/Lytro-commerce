export const MEDIA_STORAGE = Symbol('MEDIA_STORAGE');
export const MEDIA_STORE = Symbol('MEDIA_STORE');
export const MEDIA_NOTIFIER = Symbol('MEDIA_NOTIFIER');
export const FFMPEG = Symbol('FFMPEG');
// MED-04: the nightly run's clock, so the tests can age what it sees.
export const MEDIA_CLOCK = Symbol('MEDIA_CLOCK');
// D9-31: Cloudflare's cache in front of the media bucket; and the bandwidth records kept from before, until dropped.
export const MEDIA_CACHE = Symbol('MEDIA_CACHE');
export const BANDWIDTH_STORE = Symbol('BANDWIDTH_STORE');
