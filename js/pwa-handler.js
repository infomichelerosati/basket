let deferredPrompt;
let newWorker;

// INSTALLATION
window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    const installBtn = document.getElementById('install-btn');
    if (installBtn) {
        installBtn.style.display = 'block';
        installBtn.addEventListener('click', () => {
            deferredPrompt.prompt();
            deferredPrompt.userChoice.then((choiceResult) => {
                if (choiceResult.outcome === 'accepted') {
                    console.log('User accepted the install prompt');
                }
                deferredPrompt = null;
                installBtn.style.display = 'none';
            });
        });
    }
});

// SERVICE WORKER & UPDATES
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').then(reg => {
        reg.addEventListener('updatefound', () => {
            newWorker = reg.installing;
            newWorker.addEventListener('statechange', () => {
                if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                    // New update available
                    showUpdateNotification();
                }
            });
        });
    });

    // Passive update check
    async function checkVersion() {
        try {
            const response = await fetch('./version.json?t=' + new Date().getTime());
            const data = await response.json();
            const currentVersion = localStorage.getItem('dunk_version');

            if (currentVersion && currentVersion !== data.version) {
                // Version mismatch, update cache
                if (navigator.serviceWorker.controller) {
                    // We can't easily force SW update from here without logic, 
                    // but usually SW handles its own cycle.
                    // The simple way: clear cache + reload
                    caches.keys().then(names => {
                        for (let name of names) caches.delete(name);
                    }).then(() => {
                        localStorage.setItem('dunk_version', data.version);
                        window.location.reload();
                    });
                }
            } else {
                localStorage.setItem('dunk_version', data.version);
            }
        } catch (e) {
            console.log('Offline or version check failed');
        }
    }

    // Check on load
    checkVersion();
}

function showUpdateNotification() {
    const el = document.createElement('div');
    el.style.cssText = `
        position: fixed; bottom: 20px; right: 20px;
        background: #00f2ff; color: #000;
        padding: 15px 25px; border-radius: 10px;
        font-weight: bold; cursor: pointer;
        box-shadow: 0 4px 15px rgba(0,0,0,0.5);
        z-index: 2000;
    `;
    el.innerText = "New Version Available! Tap to Update";
    el.onclick = () => window.location.reload();
    document.body.appendChild(el);
}
