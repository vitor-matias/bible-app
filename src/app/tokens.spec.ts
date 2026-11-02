import { TestBed } from "@angular/core/testing"
import { App } from "@capacitor/app"
import { Network } from "@capacitor/network"
import type { LiveUpdate } from "@capawesome/capacitor-live-update"
import {
  APP_PLUGIN,
  LIVE_UPDATE_BASE_URL,
  LIVE_UPDATE_PLUGIN,
  NATIVE_CHROME_PLUGIN,
  NETWORK_PLUGIN,
} from "./tokens"

describe("plugin tokens", () => {
  beforeEach(() => {
    TestBed.configureTestingModule({})
  })

  it("should expose a noop ngOnDestroy for the App plugin", () => {
    const plugin = TestBed.inject(APP_PLUGIN) as typeof App & {
      ngOnDestroy?: () => void
    }

    expect(typeof plugin.ngOnDestroy).toBe("function")
    expect(() => plugin.ngOnDestroy?.()).not.toThrow()
    expect(plugin.addListener).toBe(App.addListener)
  })

  it("should expose a noop ngOnDestroy for the Network plugin", () => {
    const plugin = TestBed.inject(NETWORK_PLUGIN) as typeof Network & {
      ngOnDestroy?: () => void
    }

    expect(typeof plugin.ngOnDestroy).toBe("function")
    expect(() => plugin.ngOnDestroy?.()).not.toThrow()
    expect(plugin.addListener).toBe(Network.addListener)
  })

  // Prerendering creates an injector per page; registering per injector made
  // Capacitor warn "already registered" 1420 times during the build.
  it("registers the NativeChrome plugin once, however many injectors use it", () => {
    const warn = vi.spyOn(console, "warn").mockReturnValue(undefined)
    for (let i = 0; i < 3; i++) {
      TestBed.resetTestingModule()
      TestBed.configureTestingModule({})
      TestBed.inject(NATIVE_CHROME_PLUGIN)
    }

    expect(warn).not.toHaveBeenCalledWith(
      expect.stringMatching(/NativeChrome.*already registered/),
    )
  })

  it("should expose a noop ngOnDestroy for the LiveUpdate plugin", () => {
    const plugin = TestBed.inject(LIVE_UPDATE_PLUGIN) as typeof LiveUpdate & {
      ngOnDestroy?: () => void
    }

    expect(typeof plugin.ngOnDestroy).toBe("function")
    expect(() => plugin.ngOnDestroy?.()).not.toThrow()
    expect(typeof plugin.ready).toBe("function")
  })

  // Live updates stay off until a server is configured in appConfig.
  it("should leave live updates disabled by default", () => {
    expect(TestBed.inject(LIVE_UPDATE_BASE_URL)).toBe("")
  })
})
