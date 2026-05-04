self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// This will be expanded later for real push handling.
self.addEventListener('push', (event) => {
  let data = { title: 'PRISMA Alert', body: 'You have a new update.' };

  try {
    if (event.data) data = event.data.json();
  } catch {}

  event.waitUntil(
    self.registration.showNotification(data.title || 'PRISMA Alert', {
      body: data.body || 'You have a new update.',
      icon: '/icon-192.png',
      badge: '/icon-192.png'
    })
  );
});
