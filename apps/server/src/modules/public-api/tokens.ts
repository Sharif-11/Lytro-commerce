export const API_KEY_STORE = Symbol('API_KEY_STORE');
export const API_USAGE_STORE = Symbol('API_USAGE_STORE');
// The time the limits are measured against; the tests move it past a window instead of waiting.
export const API_CLOCK = Symbol('API_CLOCK');
// PRD-09, CCH-01 to CCH-12: what the public catalogue reads, its search, and its memory cache's size and version read.
export const PUBLIC_CATALOGUE_STORE = Symbol('PUBLIC_CATALOGUE_STORE');
export const CATALOGUE_SEARCH = Symbol('CATALOGUE_SEARCH');
export const CATALOGUE_CACHE_SETTINGS = Symbol('CATALOGUE_CACHE_SETTINGS');
// LND-15 to LND-17, FED-01 to FED-05: ad tracking, the feed links, and where a feed and a shop's pages are.
export const AD_TRACKING_STORE = Symbol('AD_TRACKING_STORE');
export const CATALOG_FEED_STORE = Symbol('CATALOG_FEED_STORE');
export const CATALOG_FEED_SETTINGS = Symbol('CATALOG_FEED_SETTINGS');
