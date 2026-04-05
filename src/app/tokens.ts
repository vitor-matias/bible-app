import { InjectionToken } from "@angular/core"
import { App } from "@capacitor/app"
import { Network } from "@capacitor/network"
import { Share } from "@capacitor/share"

function createNoopNgOnDestroyProxy<T extends object>(plugin: T): T {
  return new Proxy(plugin, {
    get(target, prop, receiver) {
      // Angular may try to call ngOnDestroy on injected values during teardown.
      // Capacitor plugins do not implement it, so expose a harmless noop.
      if (prop === "ngOnDestroy" && !(prop in target)) {
        return () => {}
      }
      return Reflect.get(target, prop, receiver)
    },
  })
}

export const APP_PLUGIN = new InjectionToken<typeof App>(
  "Capacitor App Plugin",
  {
    providedIn: "root",
    factory: () => createNoopNgOnDestroyProxy(App),
  },
)

export const NETWORK_PLUGIN = new InjectionToken<typeof Network>(
  "Capacitor Network Plugin",
  {
    providedIn: "root",
    factory: () => createNoopNgOnDestroyProxy(Network),
  },
)

export const SHARE_PLUGIN = new InjectionToken<typeof Share>(
  "Capacitor Share Plugin",
  {
    providedIn: "root",
    factory: () => createNoopNgOnDestroyProxy(Share),
  },
)
