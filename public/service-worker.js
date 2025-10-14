// public/service-worker.js
importScripts('https://unpkg.com/dexie@3.2.5/dist/dexie.js');
importScripts('/js/db.js');

const CACHE_NAME = 'maintenance-app-cache-v6'; // Incremented cache version
const urlsToCache = [
  '/login',
  '/technician/dashboard',
  '/offline-asset.html',
  '/offline-checklist.html',
  '/offline-report.html',
  '/offline-report-detail.html',
  '/manifest.json',
  '/image/logo.png',
  'https://cdn.jsdelivr.net/npm/tailwindcss@2.2.19/dist/tailwind.min.css',
  'https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css',
  'https://unpkg.com/dexie@3.2.5/dist/dexie.js',
  '/js/db.js'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      console.log('Opened cache and caching static assets');
      return cache.addAll(urlsToCache);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then(cacheNames => Promise.all(
      cacheNames.map(cacheName => {
        if (!cacheWhitelist.includes(cacheName)) {
          console.log('Deleting old cache:', cacheName);
          return caches.delete(cacheName);
        }
      })
    )).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(() => caches.match(event.request.url) || caches.match('/technician/dashboard'))
    );
    return;
  }
  event.respondWith(
    caches.match(event.request).then(response => {
      return response || fetch(event.request);
    })
  );
});

self.addEventListener('sync', event => {
  if (event.tag === 'sync-checklist-submissions') {
    console.log('Background sync triggered for checklist submissions.');
    event.waitUntil(syncSubmissions());
  }
});

async function syncSubmissions() {
  const pending = await getPendingSubmissions();
  if (pending.length === 0) {
    return;
  }

  console.log(`Syncing ${pending.length} pending submissions.`);
  let successfulSyncs = 0;
  let failedSyncs = 0;

  for (const submission of pending) {
    try {
      const response = await fetch('/api/sync/checklist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(submission),
      });

      if (response.ok) {
        await deletePendingSubmission(submission.id);
        successfulSyncs++;
        console.log(`Successfully synced submission for assignment ${submission.assignmentId}`);
      } else {
        failedSyncs++;
        console.error(`Failed to sync submission. Server responded with ${response.status}`);
      }
    } catch (error) {
      failedSyncs++;
      console.error('Error during fetch for sync:', error);
      // Stop trying if there's a network error
      break;
    }
  }

  // After attempting all syncs, show a notification
  if (self.registration.showNotification) {
      if (failedSyncs > 0) {
          self.registration.showNotification('Sync Failed', {
              body: `Could not sync ${failedSyncs} submission(s). Please check your connection and try again.`,
              icon: '/image/logo.png'
          });
      } else if (successfulSyncs > 0) {
          self.registration.showNotification('Sync Complete', {
              body: `${successfulSyncs} offline submission(s) have been successfully uploaded.`,
              icon: '/image/logo.png'
          });
      }
  }
}