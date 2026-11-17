import { LocationStrategy, PlatformLocation } from "@angular/common"
import { MockPlatformLocation } from "@angular/common/testing"
import { TestBed } from "@angular/core/testing"
import {
  DepthLocationStrategy,
  historyDepth,
  isPanelEntry,
} from "./depth-location-strategy"

describe("DepthLocationStrategy", () => {
  let strategy: LocationStrategy
  let platform: MockPlatformLocation

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        { provide: PlatformLocation, useClass: MockPlatformLocation },
        { provide: LocationStrategy, useClass: DepthLocationStrategy },
      ],
    })
    strategy = TestBed.inject(LocationStrategy)
    platform = TestBed.inject(PlatformLocation) as MockPlatformLocation
  })

  const depth = () => historyDepth(platform.getState())

  it("counts the app's pages behind each entry", () => {
    strategy.replaceState(null, "", "/gn/1", "")
    expect(depth()).toBe(0)

    strategy.pushState({ navigationId: 2 }, "", "/search", "")
    expect(depth()).toBe(1)
    // The router's own state is kept.
    expect(platform.getState()).toEqual({ navigationId: 2, appDepth: 1 })

    strategy.pushState(null, "", "/gn/2", "")
    expect(depth()).toBe(2)
  })

  // A chapter that replaces the one before it is no deeper.
  it("keeps the depth when an entry is replaced", () => {
    strategy.pushState(null, "", "/gn/1", "")
    strategy.replaceState(null, "", "/gn/2", "")
    expect(depth()).toBe(1)
  })

  it("reads the depth back from the entry Back returns to", () => {
    strategy.pushState(null, "", "/search", "")
    strategy.pushState(null, "", "/gn/3", "")
    platform.back()
    expect(depth()).toBe(1)

    // A page pushed from there replaces what was ahead, one deeper.
    strategy.pushState(null, "", "/about", "")
    expect(depth()).toBe(2)
  })

  // A panel's link left the panel's entry (BackButtonService) behind it, at
  // the old page's address: Back from the new page needed two presses.
  it("replaces an open panel's entry with the page opened from the panel", () => {
    strategy.replaceState(null, "", "/jo/3", "")
    platform.pushState({ appDepth: 1, appPanel: true }, "", "/jo/3")

    strategy.pushState({ navigationId: 2 }, "", "/jo/5", "")

    expect(platform.getState()).toEqual({ navigationId: 2, appDepth: 1 })
    platform.back()
    expect(platform.pathname).toBe("/jo/3")
    expect(isPanelEntry(platform.getState())).toBe(false)
  })

  it("keeps a panel's entry one when the router replaces it", () => {
    platform.pushState({ appDepth: 1, appPanel: true }, "", "/jo/3")

    strategy.replaceState({ navigationId: 3 }, "", "/jo/3", "")

    expect(platform.getState()).toEqual({
      navigationId: 3,
      appDepth: 1,
      appPanel: true,
    })
    expect(isPanelEntry(platform.getState())).toBe(true)
  })

  it("reads no depth from an entry without one", () => {
    expect(historyDepth(null)).toBe(0)
    expect(historyDepth({ navigationId: 3 })).toBe(0)
    expect(historyDepth({ appDepth: "2" })).toBe(0)
  })
})
