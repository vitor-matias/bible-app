import { InjectionToken } from "@angular/core"
import { App } from "@capacitor/app"
import { registerPlugin, SystemBars } from "@capacitor/core"
import { Haptics } from "@capacitor/haptics"
import { Network } from "@capacitor/network"
import { Share } from "@capacitor/share"
import { SplashScreen } from "@capacitor/splash-screen"
import { LiveUpdate } from "@capawesome/capacitor-live-update"
import { appConfig } from "./config"
import type { NativeChromePlugin } from "./services/native-chrome.service"

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

/**
 * The iOS shell's native bars, defined in ios/App/App/NativeChrome.swift.
 * Registered once, at module load, as the @capacitor packages do: prerendering
 * creates an injector per page, and registering again warns every time.
 */
const NativeChrome = registerPlugin<NativeChromePlugin>("NativeChrome")

export const NATIVE_CHROME_PLUGIN = new InjectionToken<NativeChromePlugin>(
  "Native Chrome Plugin",
  {
    providedIn: "root",
    factory: () => createNoopNgOnDestroyProxy(NativeChrome),
  },
)
