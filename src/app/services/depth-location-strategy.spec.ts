import { LocationStrategy, PlatformLocation } from "@angular/common"
import { MockPlatformLocation } from "@angular/common/testing"
import { TestBed } from "@angular/core/testing"
import {
  DepthLocationStrategy,
  historyDepth,
  isPanelEntry,
  REVERT_STATE,
  setPanelsCloser,
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

  // ‹ › to a chapter that failed to load: the revert replaced its entry with
  // the chapter before, which then came twice, and Back seemed to do nothing.
  describe("a page reverted to the one it was opened from", () => {
    const revert = (url: string) =>
      strategy.replaceState({ ...REVERT_STATE, navigationId: 3 }, "", url, "")

    afterEach(() => setPanelsCloser(null))

    it("steps back to that page's entry", () => {
      strategy.replaceState(null, "", "/mt/5", "?verseStart=3")
      strategy.pushState({ navigationId: 2 }, "", "/mt/6", "")

      revert("/mt/5")

      expect(platform.pathname).toBe("/mt/5")
      expect(platform.getState()).toEqual({ navigationId: 3, appDepth: 0 })
      // Back from here leaves the reader: nothing before the chapter.
      platform.back()
      expect(platform.pathname).toBe("/mt/5")
    })

    it("steps back over a panel opened since, closing it", () => {
      const close = vi.fn()
      setPanelsCloser(close)
      strategy.replaceState(null, "", "/mt/5", "")
      strategy.pushState(null, "", "/mt/6", "")
      platform.pushState({ appDepth: 2, appPanel: true }, "", "/mt/6")

      revert("/mt/5")

      expect(close).toHaveBeenCalled()
      expect(platform.pathname).toBe("/mt/5")
      expect(platform.getState()).toEqual({ navigationId: 3, appDepth: 0 })
    })

    // A citation from the notes takes the sheet's entry: the chapter under
    // the sheet is the one before.
    it("steps back to the page under the panel the page was opened from", () => {
      strategy.replaceState(null, "", "/mt/5", "")
      platform.pushState({ appDepth: 1, appPanel: true }, "", "/mt/5")
      strategy.pushState(null, "", "/lc/6", "")

      revert("/mt/5")

      expect(platform.pathname).toBe("/mt/5")
      expect(platform.getState()).toEqual({ navigationId: 3, appDepth: 0 })
    })

    // Back onto a chapter that failed: the page shown is ahead, not behind.
    it("replaces the entry when the page wasn't opened from there", () => {
      strategy.replaceState(null, "", "/mt/5", "")
      strategy.pushState(null, "", "/mt/6", "")
      platform.back()

      revert("/mt/6")

      expect(platform.pathname).toBe("/mt/6")
      expect(platform.getState()).toEqual({ navigationId: 3, appDepth: 0 })
    })

    // The apps replace a chapter step: a plain replace stays one.
    it("replaces the entry without the revert's state", () => {
      strategy.replaceState(null, "", "/mt/5", "")
      strategy.pushState(null, "", "/mt/6", "")

      strategy.replaceState({ navigationId: 3 }, "", "/mt/5", "")

      expect(platform.pathname).toBe("/mt/5")
      expect(depth()).toBe(1)
    })
  })

  it("reads no depth from an entry without one", () => {
    expect(historyDepth(null)).toBe(0)
    expect(historyDepth({ navigationId: 3 })).toBe(0)
    expect(historyDepth({ appDepth: "2" })).toBe(0)
  })
})
