// Domma Mart — serviço do aplicativo instalável.
// Regra de segurança: páginas e dados nunca ficam guardados (saldo, vendas e checkout são sempre buscados na hora).
// Só ficam em cache os arquivos estáticos do próprio site e a tela de "sem conexão".
const CACHE = "dm-static-v1";
const OFFLINE = "/offline";

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll([OFFLINE, "/icon-192.png"])).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Navegação: sempre pela rede; sem conexão, mostra a tela de aviso.
  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(() => caches.match(OFFLINE)));
    return;
  }
  // Arquivos estáticos com nome único por versão: cache primeiro.
  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/home/") || /^\/icon-.*\.png$/.test(url.pathname)) {
    event.respondWith(
      caches.match(request).then(
        (hit) =>
          hit ||
          fetch(request).then((response) => {
            if (response.ok) {
              const copy = response.clone();
              caches.open(CACHE).then((cache) => cache.put(request, copy));
            }
            return response;
          }),
      ),
    );
  }
});
