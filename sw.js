const CACHE_NAME = 'nexsoar-cache-v1'
const ASSETS = [
  './index.html',
  './css/styles.css',
  './js/supabase-client.js',
  './js/app.js',
  './Logo.jpg',
  './manifest.json'
]

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(ASSETS).catch(err => console.log('Error caching assets:', err))
    })
  )
})

self.addEventListener('fetch', e => {
  e.respondWith(
    caches.match(e.request).then(response => {
      return response || fetch(e.request)
    }).catch(() => {
      // Fallback offline
    })
  )
})
