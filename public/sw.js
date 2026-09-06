// Minimalni service worker. Appka ho potrebuje jen proto, aby ji Chrome
// na Androidu nabidl jako plnohodnotnou appku k INSTALACI ("Instalovat
// aplikaci" -- bezi bez adresniho radku), ne jen jako zalozku ("Pridat
// na plochu" -- otevre se v odlehcenem prohlizeci s adresnim radkem).
// iOS Safari tohle nepotrebuje, Android Chrome ano.
//
// Schvalne nic necachuje (viz "fetch" nize -- prazdny listener, bez
// event.respondWith(), takze prohlizec pozadavek zpracuje normalne,
// jako by tu service worker vubec nebyl). Uz jsme resili problem se
// starou zacachovanou verzi appky (viz vercel.json) -- agresivni
// cachovani pres service worker by to riziko jen znovu otevrelo.

self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener('fetch', () => {
  // Prazdno -- prohlizec si pozadavek obslouzi sam, normalne pres sit.
})

// --- push notifikace (chyt partiaka, denni vyhled podminek) ---
// Appka posila jen data-only push (title/body/url v JSON), zadne
// zobrazovani appka nedela na serveru -- tenhle listener je jedine
// misto, kde se z prijate zpravy stane skutecna notifikace v systemu.
self.addEventListener('push', (event) => {
  let data = {}
  try { data = event.data ? event.data.json() : {} } catch { data = {} }
  const title = data.title || 'Nahodit'
  const options = {
    body: data.body || '',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    data: { url: data.url || '/' },
  }
  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = event.notification.data?.url || '/'
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.navigate(url)
          return client.focus()
        }
      }
      return self.clients.openWindow(url)
    })
  )
})
