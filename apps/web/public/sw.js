/*
 * Where Is My Bread — Web Push service worker.
 *
 * Push-only: no fetch handler, no offline caching. Its sole jobs are to show a
 * notification when a push arrives and to focus/open the app when one is
 * clicked. Keep it dependency-free and tiny.
 */

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: 'Where Is My Bread', body: event.data ? event.data.text() : '' };
  }

  const title = data.title || 'Where Is My Bread';
  const url = data.url || '/notifications';

  event.waitUntil(
    (async () => {
      await self.registration.showNotification(title, {
        body: data.body || '',
        icon: '/icon-192.png',
        badge: '/icon-192.png',
        tag: data.tag || undefined,
        data: { url },
      });
      // Nudge any open tab to pull fresh data in the background — a synced
      // payment / triaged transaction should appear without a manual reload.
      const clients = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      });
      for (const client of clients) {
        client.postMessage({ type: 'wib:push', url });
      }
    })(),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target =
    (event.notification.data && event.notification.data.url) || '/notifications';
  const targetUrl = new URL(target, self.location.origin);

  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clients) => {
        // Already on the exact deep link (query included) → just focus.
        for (const client of clients) {
          if (client.url === targetUrl.href && 'focus' in client) {
            return client.focus();
          }
        }
        // Otherwise steer an open tab to it (honours ?focus=… deep links even
        // when a /plan tab is already open), else open a new one.
        for (const client of clients) {
          if ('focus' in client) {
            if ('navigate' in client) {
              return client.navigate(target).then((c) => (c || client).focus());
            }
            return client.focus();
          }
        }
        return self.clients.openWindow(target);
      }),
  );
});
