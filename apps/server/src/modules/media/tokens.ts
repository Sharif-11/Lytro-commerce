export const MEDIA_STORAGE = Symbol('MEDIA_STORAGE');
export const MEDIA_STORE = Symbol('MEDIA_STORE');
export const MEDIA_NOTIFIER = Symbol('MEDIA_NOTIFIER');
export const FFMPEG = Symbol('FFMPEG');
// MED-04: the nightly run's clock, so the tests can age what it sees.
export const MEDIA_CLOCK = Symbol('MEDIA_CLOCK');
// MED-10, BND-01: the media Worker's side of Cloudflare, each shop's bandwidth, and its warnings.
export const MEDIA_EDGE = Symbol('MEDIA_EDGE');
export const BANDWIDTH_STORE = Symbol('BANDWIDTH_STORE');
export const BANDWIDTH_SETTINGS = Symbol('BANDWIDTH_SETTINGS');
