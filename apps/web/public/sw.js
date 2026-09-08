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
  const target = (event.notification.data && event.notification.data.url) || '/notifications';

  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clients) => {
        for (const client of clients) {
          const clientUrl = new URL(client.url);
          if (clientUrl.pathname === target && 'focus' in client) {
            return client.focus();
          }
        }
        for (const client of clients) {
          if ('focus' in client) {
            client.navigate(target);
            return client.focus();
          }
        }
        return self.clients.openWindow(target);
      }),
  );
});
