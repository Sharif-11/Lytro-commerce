/* global self */
/* NTF-02 (Phase 7 Slice 7.7): what the dashboard's service worker does with a push. The server sends { title, body, url,
   tag, id } (apps/server/src/modules/notifications/services/push-sender.ts), already in the person's language; the
   notification opens its page, the shop's slug in front. Imported into the worker vite-plugin-pwa generates. */
self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : '' };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || 'Lytro', {
      body: data.body || '',
      tag: data.tag || undefined,
      icon: '/logo.svg',
      badge: '/logo.svg',
      data: { url: data.url || '/' },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      for (const each of windows) {
        if ('navigate' in each && 'focus' in each) {
          return each.navigate(url).then((opened) => (opened || each).focus());
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
