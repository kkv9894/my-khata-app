// public/sw.js
// ✅ BLINK FIX: This SW is intentionally inert.
// The old version had skipWaiting() + clients.claim() which forced page reloads.
// Now it just installs and activates quickly so the browser stops using the old cached version.

self.addEventListener('install', () => {
  // ✅ skipWaiting here is SAFE — this SW does nothing harmful on activate
  // It just replaces the old bad SW as fast as possible
  self.skipWaiting();
});

self.addEventListener('activate', () => {
  // ✅ claim() here is also safe — this SW intercepts nothing, so no reload loop
  self.clients.claim();
});

// ✅ No fetch handler — no caching, no interception, no reload triggers
// Offline queue works via localStorage in useOfflineSync.ts instead