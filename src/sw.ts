/// <reference lib="webworker" />
import { precacheAndRoute, cleanupOutdatedCaches, createHandlerBoundToURL } from 'workbox-precaching'
import { NavigationRoute, registerRoute } from 'workbox-routing'
import { clientsClaim } from 'workbox-core'

declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: (string | { url: string; revision: string | null })[] }

self.skipWaiting()
clientsClaim()
cleanupOutdatedCaches()
precacheAndRoute(self.__WB_MANIFEST)
// La app funciona como SPA también sin conexión (los datos requieren internet)
registerRoute(new NavigationRoute(createHandlerBoundToURL('/index.html'), { denylist: [/^\/api\//] }))

self.addEventListener('push', (event) => {
  let data: { title?: string; body?: string; url?: string; tag?: string; badge?: number } = {}
  try { data = event.data?.json() ?? {} } catch { data = { title: 'Gymaiego', body: event.data?.text() } }
  const nav = self.navigator as Navigator & { setAppBadge?: (n?: number) => Promise<void> }
  event.waitUntil(Promise.all([
    self.registration.showNotification(data.title ?? 'Gymaiego', {
      body: data.body ?? '',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      tag: data.tag,
      renotify: !!data.tag,
      data: { url: data.url ?? '/' },
    } as NotificationOptions),
    // número rojo sobre el ícono de la app (iPhone con la app instalada)
    nav.setAppBadge ? nav.setAppBadge(data.badge ?? 1).catch(() => {}) : Promise.resolve(),
  ]))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = (event.notification.data as { url?: string })?.url ?? '/'
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    for (const c of all) {
      if ('focus' in c) { await (c as WindowClient).focus(); (c as WindowClient).navigate(url).catch(() => {}); return }
    }
    await self.clients.openWindow(url)
  })())
})
