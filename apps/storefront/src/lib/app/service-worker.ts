// CCH-10, Slice 12c's read point 2: the installed storefront's service worker, served at /sw.js with this build's
// version. Network first: every page still asks the server, so it is counted (SFT-11) and its prices are current; a
// page's saved copy shows only when the network is down. Kept: the app's own files by version, the last
// PAGES_KEPT pages viewed, and the photos and faces they showed. Never kept: the cart, search, the storefront's own
// API (the delivery estimate, the lists' next pages, the locations) and Next's in-app navigation answers. A page never
// saved, or one never kept (search, the cart) asked for offline, shows /offline, which is kept with the files it needs
// when the worker installs. Plain JavaScript, as a browser runs it.

/** How many pages and photos a phone keeps for when it is offline, the oldest let go first. */
export const PAGES_KEPT = 20;
export const PHOTOS_KEPT = 60;

/** The worker's source for this build. A new build is a new worker, which drops the old build's files. */
export function serviceWorkerSource(version: string): string {
  return `'use strict';
const VERSION = ${JSON.stringify(version)};
const FRAME = 'frame-' + VERSION;
const PAGES = 'pages';
const PHOTOS = 'photos';
const PAGES_KEPT = ${String(PAGES_KEPT)};
const PHOTOS_KEPT = ${String(PHOTOS_KEPT)};
const OFFLINE = '/offline';
const NEVER_KEPT = ['/api/', '/search', '/cart', '/sw.js', '/manifest.webmanifest', '/offline'];

/** The offline page, and the scripts and styles it names, so it can show without the network. */
async function keepOffline() {
  const cache = await caches.open(FRAME);
  const response = await fetch(new Request(OFFLINE, { cache: 'reload' }));
  await cache.put(OFFLINE, response.clone());
  const html = await response.text();
  const files = new Set(html.match(/\\/_next\\/static\\/[^"'\\s)]+/g) || []);
  await Promise.all([...files].map((file) => cache.add(file).catch(() => undefined)));
}

self.addEventListener('install', (event) => {
  event.waitUntil(keepOffline().then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((names) => Promise.all(names.filter((name) => name.startsWith('frame-') && name !== FRAME).map((name) => caches.delete(name))))
      .then(() => self.clients.claim()),
  );
});

/** Puts an answer last in its cache, letting the oldest go past the cap. */
async function keep(name, request, response, max) {
  const cache = await caches.open(name);
  await cache.delete(request);
  await cache.put(request, response);
  const keys = await cache.keys();
  for (const old of keys.slice(0, Math.max(0, keys.length - max))) await cache.delete(old);
}

async function fromFrame(request) {
  const kept = await caches.match(request, { cacheName: FRAME });
  if (kept) return kept;
  const response = await fetch(request);
  if (response.ok) await (await caches.open(FRAME)).put(request, response.clone());
  return response;
}

/** A page from the network; kept for later unless it is one never kept; offline, the kept copy or the offline page. */
async function page(request, keepIt) {
  try {
    const response = await fetch(request);
    if (keepIt && response.ok && response.type === 'basic') await keep(PAGES, request, response.clone(), PAGES_KEPT);
    return response;
  } catch (error) {
    const kept = keepIt ? await caches.match(request, { cacheName: PAGES }) : undefined;
    return kept || (await caches.match(OFFLINE, { cacheName: FRAME })) || Response.error();
  }
}

async function photo(request) {
  const kept = await caches.match(request, { cacheName: PHOTOS });
  if (kept) return kept;
  const response = await fetch(request);
  if (response.ok || response.type === 'opaque') await keep(PHOTOS, request, response.clone(), PHOTOS_KEPT);
  return response;
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  const here = url.origin === self.location.origin;
  const neverKept = here && NEVER_KEPT.some((path) => url.pathname === path || url.pathname.startsWith(path.endsWith('/') ? path : path + '/'));
  if (here && request.mode === 'navigate') {
    event.respondWith(page(request, !neverKept));
    return;
  }
  if (neverKept) return;
  if (here && (request.headers.has('RSC') || url.searchParams.has('_rsc'))) return;
  if (here && url.pathname.startsWith('/_next/static/')) {
    event.respondWith(fromFrame(request));
    return;
  }
  if (['image', 'font', 'style'].includes(request.destination)) event.respondWith(photo(request));
});
`;
}
