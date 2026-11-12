import { Capacitor } from "@capacitor/core"
import { isBrowser, isServiceWorkerEnabled, isStandaloneApp } from "./platform"

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

describe("isStandaloneApp", () => {
  const displayMode = (standalone: boolean) =>
    vi
      .spyOn(window, "matchMedia")
      .mockReturnValue({ matches: standalone } as MediaQueryList)

  afterEach(() => {
    delete (navigator as { standalone?: boolean }).standalone
  })

  it("is false in a browser tab", () => {
    displayMode(false)
    vi.spyOn(Capacitor, "isNativePlatform").mockReturnValue(false)
    expect(isStandaloneApp()).toBe(false)
  })

  it("is true for an installed web app", () => {
    displayMode(true)
    vi.spyOn(Capacitor, "isNativePlatform").mockReturnValue(false)
    expect(isStandaloneApp()).toBe(true)
  })

  it("is true for an iOS home-screen app", () => {
    displayMode(false)
    vi.spyOn(Capacitor, "isNativePlatform").mockReturnValue(false)
    Object.defineProperty(navigator, "standalone", {
      value: true,
      configurable: true,
    })
    expect(isStandaloneApp()).toBe(true)
  })

  it("is true inside the native shells", () => {
    displayMode(false)
    vi.spyOn(Capacitor, "isNativePlatform").mockReturnValue(true)
    expect(isStandaloneApp()).toBe(true)
  })
})
