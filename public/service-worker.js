// public/service-worker.js
importScripts('https://unpkg.com/dexie@3.2.5/dist/dexie.js');
importScripts('/js/db.js');

const CACHE_NAME = 'maintenance-app-cache-v4'; // <-- Version bumped to v4
const urlsToCache = [
  '/login',
  '/technician/dashboard',
  '/offline-asset.html', // <-- ADD THIS LINE
  '/manifest.json',
  '/image/logo.png',
  'https://cdn.jsdelivr.net/npm/tailwindcss@2.2.19/dist/tailwind.min.css',
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
          return caches.delete(cacheName);
        }
      })
    )).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  // Always try to fetch from the network first for navigation requests
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(() => caches.match(event.request))
    );
    return;
  }
  // For other requests, serve from cache first
  event.respondWith(
    caches.match(event.request).then(response => {
      return response || fetch(event.request);
    })
  );
});

// BACKGROUND SYNC EVENT
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

  for (const submission of pending) {
    try {
      const response = await fetch('/api/sync/checklist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(submission),
      });

      if (response.ok) {
        // If sync is successful, delete it from IndexedDB
        await deletePendingSubmission(submission.id);
        console.log(`Successfully synced submission for assignment ${submission.assignmentId}`);
      } else {
        console.error(`Failed to sync submission. Server responded with ${response.status}`);
      }
    } catch (error) {
      console.error('Error during fetch for sync:', error);
      // If there's a network error, break the loop and try again later.
      break;
    }
  }
}