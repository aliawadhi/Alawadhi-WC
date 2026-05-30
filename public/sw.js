const CACHE_NAME = 'wc-pool-v6';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/manifest.json'
];

// Install Event
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[Service Worker] Pre-caching offline support assets resiliently and bypassing browser HTTP Cache.');
      
      // Cache assets individually and bypass browser HTTP cache on initial install to ensure fresh copies
      const cachePromises = ASSETS_TO_CACHE.map((asset) => {
        const fetchRequest = new Request(asset, { cache: 'reload' });
        return fetch(fetchRequest)
          .then((response) => {
            if (!response.ok) throw new Error(`Fetch failed: ${response.statusText}`);
            return cache.put(asset, response);
          })
          .then(() => console.log(`[Service Worker] Successfully cached fresh asset: ${asset}`))
          .catch((err) => {
            console.warn(`[Service Worker] Cache-bypass fetch failed for ${asset}, attempting standard fallback:`, err);
            return cache.add(asset)
              .catch((err2) => console.error(`[Service Worker] Fatal fail caching ${asset}:`, err2));
          });
      });
      return Promise.all(cachePromises);
    }).then(() => self.skipWaiting())
  );
});

// Activate Event
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            console.log('[Service Worker] Removing old cache:', key);
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch Event - Network-First, with safe fallback to cache
self.addEventListener('fetch', (event) => {
  // Only handle GET requests and skip browser extensions/auth APIs
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  
  // Skip supabase APIs, auth checks, dev tools, and external services to avoid caching dynamic state
  if (url.origin !== self.location.origin) return;
  if (url.pathname.includes('/api/') || url.pathname.includes('/supabase/')) return;
  
  // Force browser's aggressive HTTP caches to bypass for key entry points (index.html, manifest)
  const isCritical = url.pathname === '/' || url.pathname.endsWith('/index.html') || url.pathname.endsWith('manifest.json');
  let fetchRequest = event.request;
  if (isCritical) {
    try {
      fetchRequest = new Request(event.request, { cache: 'reload' });
    } catch (e) {
      fetchRequest = event.request;
    }
  }

  event.respondWith(
    fetch(fetchRequest)
      .then((networkResponse) => {
        // If the request succeeds and is cacheable, cache it
        if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return networkResponse;
      })
      .catch(() => {
        // Network failed (offline), check the cache
        return caches.match(event.request).then((cachedResponse) => {
          if (cachedResponse) {
            return cachedResponse;
          }
          // If a navigation request fails and nothing in cache, return index.html
          if (event.request.mode === 'navigate') {
            return caches.match('/');
          }
        });
      })
  );
});

// Listener for skip waiting messages
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
