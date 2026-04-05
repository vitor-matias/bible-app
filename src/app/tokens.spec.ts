import { TestBed } from "@angular/core/testing"
import { App } from "@capacitor/app"
import { Network } from "@capacitor/network"
import { Share } from "@capacitor/share"
import { APP_PLUGIN, NETWORK_PLUGIN, SHARE_PLUGIN } from "./tokens"

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

  it("should expose a noop ngOnDestroy for the Share plugin", () => {
    const plugin = TestBed.inject(SHARE_PLUGIN) as typeof Share & {
      ngOnDestroy?: () => void
    }

    expect(typeof plugin.ngOnDestroy).toBe("function")
    expect(() => plugin.ngOnDestroy?.()).not.toThrow()
    expect(typeof plugin.share).toBe("function")
  })
})
