// public/service-worker.js
importScripts('https://unpkg.com/dexie@3.2.5/dist/dexie.js');
importScripts('/js/db.js');

// Incremented cache version to v12 to force install of the new, corrected service worker
const CACHE_NAME = 'maintenance-app-cache-v12';
const urlsToCache = [
  // Add the root URL to handle the initial launch properly
  '/',
  '/technician/dashboard',
  '/login',
  '/offline-asset.html',
  '/offline-checklist.html',
  '/offline-report.html',
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
  // --- ROBUST OFFLINE STRATEGY FOR PAGES ---
  if (event.request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          // 1. Try to fetch the page from the network first.
          const networkResponse = await fetch(event.request);
          return networkResponse;
        } catch (error) {
          // 2. If the network fails (offline), open the cache.
          console.log('Fetch failed, user is offline. Serving from cache.');
          const cache = await caches.open(CACHE_NAME);
          
          // 3. Try to match the exact requested page (e.g., offline-checklist.html).
          const cachedResponse = await cache.match(event.request.url);
          if (cachedResponse) {
            return cachedResponse;
          }
          
          // 4. If the exact page is not in cache, serve the main dashboard as the ultimate fallback.
          // This is the key fix for the "site can't be reached" error on launch.
          return await cache.match('/technician/dashboard');
        }
      })()
    );
    return;
  }

  // --- CACHE-FIRST STRATEGY FOR ASSETS (JS, CSS, IMAGES) ---
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
        const payload = {
            assignmentId: submission.assignmentId,
            results: submission.results,
            note: submission.note
        };
      const response = await fetch('/api/sync/checklist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
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
      break;
    }
  }

  if (self.registration.showNotification) {
      if (failedSyncs > 0) {
          self.registration.showNotification('Sync Failed', {
              body: `Could not sync ${failedSyncs} submission(s). Please try syncing manually.`,
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