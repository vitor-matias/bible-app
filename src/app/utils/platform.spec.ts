import { Capacitor } from "@capacitor/core"
import { isBrowser, isServiceWorkerEnabled } from "./platform"

describe("isBrowser", () => {
  // The negative case only exists in the prerender worker, which has neither
  // global; the guards that call this are covered by the server-rendering
  // specs of their own consumers (ThemeService, KeepAwakeService, the reader).
  it("is true in a browser", () => {
    expect(isBrowser()).toBeTrue()
  })
})

describe("isServiceWorkerEnabled", () => {
  it("is enabled for production web builds", () => {
    spyOn(Capacitor, "isNativePlatform").and.returnValue(false)
    expect(isServiceWorkerEnabled(false)).toBeTrue()
  })

  it("is disabled in dev mode", () => {
    spyOn(Capacitor, "isNativePlatform").and.returnValue(false)
    expect(isServiceWorkerEnabled(true)).toBeFalse()
  })

  it("is disabled inside the native shells", () => {
    spyOn(Capacitor, "isNativePlatform").and.returnValue(true)
    expect(isServiceWorkerEnabled(false)).toBeFalse()
  })
})
