/// <reference lib="webworker" />
import { clientsClaim } from 'workbox-core'
import { precacheAndRoute, cleanupOutdatedCaches, matchPrecache } from 'workbox-precaching'
import { registerRoute, NavigationRoute } from 'workbox-routing'
import { NetworkOnly } from 'workbox-strategies'

declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: Array<{ url: string; revision: string | null }> }
self.skipWaiting()
clientsClaim()
cleanupOutdatedCaches()
precacheAndRoute(self.__WB_MANIFEST)

const network = new NetworkOnly()
registerRoute(new NavigationRoute(async context => {
  try {
    return await network.handle(context)
  } catch {
    return await matchPrecache('/offline.html') ?? Response.error()
  }
}, { denylist: [/^\/api\//, /^\/auth\//] }))
// No Supabase/API runtime caching, Background Sync, or write queue.
