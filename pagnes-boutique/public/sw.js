// Service worker minimal : l'application (HTML, JS, CSS) fonctionne hors ligne après le premier chargement.
// Il ne touche JAMAIS aux appels vers l'API (autre origine) : ces réponses contiennent des données de vente
// et des prix d'achat, elles ne doivent pas rester dans le cache du navigateur ni survivre à la déconnexion.
// (Le catalogue de la caisse hors ligne est gardé par l'application elle-même, sans prix d'achat : voir src/lib/horsLigne.ts.)
const CACHE = 'pagnes-v3';
// À l'installation : la page d'accueil ET les fichiers qu'elle charge (JS, CSS de Vite, au nom haché).
// Sans eux, la page s'ouvrirait hors ligne… sans son code : à la première visite, ces fichiers ont été
// téléchargés avant que ce service worker ne soit actif, il ne les a donc pas vus passer.
self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(async c => {
    await c.addAll(['./', './index.html', './icon.svg', './manifest.webmanifest']).catch(() => {});
    try {
      const html = await (await fetch('./index.html', { cache: 'no-cache' })).text();
      const fichiers = [...html.matchAll(/(?:src|href)="([^"]+\.(?:js|css))"/g)].map(m => new URL(m[1], self.registration.scope).href);
      await c.addAll(fichiers);
    } catch { /* hors ligne à l'installation : ils seront gardés au prochain chargement */ }
  }));
});
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  if (new URL(e.request.url).origin !== self.location.origin) return; // API et ressources externes : réseau uniquement
  e.respondWith(
    fetch(e.request).then(res => { const copy = res.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); return res; })
      // ignoreVary : un serveur qui répond « Vary: Origin » rendrait introuvable un fichier mis en cache à l'installation.
      .catch(() => caches.match(e.request, { ignoreVary: true }).then(r => r || caches.match('./index.html', { ignoreVary: true })))
  );
});
