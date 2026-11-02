import { Capacitor } from "@capacitor/core"
import { isBrowser, isServiceWorkerEnabled } from "./platform"

describe("isBrowser", () => {
  // The negative case only exists in the prerender worker, which has neither
  // global; the guards that call this are covered by the server-rendering
  // specs of their own consumers (ThemeService, KeepAwakeService, the reader).
  it("is true in a browser", () => {
    expect(isBrowser()).toBe(true)
  })
})

describe("isServiceWorkerEnabled", () => {
  it("is enabled for production web builds", () => {
    vi.spyOn(Capacitor, "isNativePlatform").mockReturnValue(false)
    expect(isServiceWorkerEnabled(false)).toBe(true)
  })

  it("is disabled in dev mode", () => {
    vi.spyOn(Capacitor, "isNativePlatform").mockReturnValue(false)
    expect(isServiceWorkerEnabled(true)).toBe(false)
  })

  it("is disabled inside the native shells", () => {
    vi.spyOn(Capacitor, "isNativePlatform").mockReturnValue(true)
    expect(isServiceWorkerEnabled(false)).toBe(false)
  })
})
