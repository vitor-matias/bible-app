import { InjectionToken } from "@angular/core"
import { App } from "@capacitor/app"
import { SystemBars } from "@capacitor/core"
import { Haptics } from "@capacitor/haptics"
import { Network } from "@capacitor/network"
import { Share } from "@capacitor/share"
import { SplashScreen } from "@capacitor/splash-screen"
import { LiveUpdate } from "@capawesome/capacitor-live-update"
import { appConfig } from "./config"

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

export const HAPTICS_PLUGIN = new InjectionToken<typeof Haptics>(
  "Capacitor Haptics Plugin",
  {
    providedIn: "root",
    factory: () => createNoopNgOnDestroyProxy(Haptics),
  },
)

export const SPLASH_SCREEN_PLUGIN = new InjectionToken<typeof SplashScreen>(
  "Capacitor Splash Screen Plugin",
  {
    providedIn: "root",
    factory: () => createNoopNgOnDestroyProxy(SplashScreen),
  },
)

export const SYSTEM_BARS_PLUGIN = new InjectionToken<typeof SystemBars>(
  "Capacitor System Bars Plugin",
  {
    providedIn: "root",
    factory: () => createNoopNgOnDestroyProxy(SystemBars),
  },
)

export const LIVE_UPDATE_PLUGIN = new InjectionToken<typeof LiveUpdate>(
  "Capawesome Live Update Plugin",
  {
    providedIn: "root",
    factory: () => createNoopNgOnDestroyProxy(LiveUpdate),
  },
)

/** Where live-update manifests are served; empty disables live updates. */
export const LIVE_UPDATE_BASE_URL = new InjectionToken<string>(
  "Live update base URL",
  {
    providedIn: "root",
    factory: () => appConfig.liveUpdateBaseUrl,
  },
)
