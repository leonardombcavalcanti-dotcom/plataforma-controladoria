// Service worker mínimo — habilita a instalação como app (PWA).
// Estratégia: rede sempre (dados vivos do Supabase); sem cache offline nesta fase.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => { /* passthrough */ });
