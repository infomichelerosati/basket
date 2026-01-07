const CACHE_NAME = 'dunk-master-v1.3.2';
const ASSETS_TO_CACHE = [
    './',
    './index.html',
    './css/style.css',
    './js/game.js',
    './js/leaderboard.js',
    './js/audio.js',
    './js/pwa-handler.js',
    './manifest.json',
    './assets/icon-192.png',
    './assets/icon-512.png'
];

self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(ASSETS_TO_CACHE))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cache => {
                    if (cache !== CACHE_NAME) {
                        return caches.delete(cache);
                    }
                })
            );
        }).then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', event => {
    // Version check strategy: always fetch version.json from network
    if (event.request.url.endsWith('version.json')) {
        event.respondWith(fetch(event.request).catch(() => caches.match(event.request)));
        return;
    }

    // Cache First for everything else
    event.respondWith(
        caches.match(event.request)
            .then(response => {
                if (response) {
                    return response;
                }
                return fetch(event.request);
            })
    );
});

// Listen for skipWaiting message
self.addEventListener('message', event => {
    if (event.data.action === 'skipWaiting') {
        self.skipWaiting();
    }
});
