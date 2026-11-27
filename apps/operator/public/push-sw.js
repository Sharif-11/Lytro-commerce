/* global self */
/* LIVE-CHAT-PLAN LC-4: what the console's service worker does with a chat push. The server sends { title, body, url,
   tag } (apps/server/src/modules/live-chat/services/chat-push.ts): the shop's name, its message and the chat's page.
   Copied from the dashboard's own (apps/dashboard/public/push-sw.js); imported into the worker vite-plugin-pwa generates. */
self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : '' };
  }
  // An open console hears the message over its live connection and plays its own sound; while one is in front, the
  // system's alert stays quiet (never two sounds), and otherwise it sounds and vibrates.
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      const watched = windows.some((each) => each.visibilityState === 'visible' && each.focused);
      for (const each of windows) each.postMessage({ type: 'lytro:push' });
      return self.registration.showNotification(data.title || 'Lytro', {
        body: data.body || '',
        tag: data.tag || undefined,
        icon: '/logo.svg',
        badge: '/logo.svg',
        data: { url: data.url || '/' },
        silent: watched,
        ...(watched ? {} : { vibrate: [200, 100, 200] }),
      });
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
