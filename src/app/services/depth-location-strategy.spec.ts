import { LocationStrategy, PlatformLocation } from "@angular/common"
import { MockPlatformLocation } from "@angular/common/testing"
import { TestBed } from "@angular/core/testing"
import { DepthLocationStrategy, historyDepth } from "./depth-location-strategy"

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

  it("reads no depth from an entry without one", () => {
    expect(historyDepth(null)).toBe(0)
    expect(historyDepth({ navigationId: 3 })).toBe(0)
    expect(historyDepth({ appDepth: "2" })).toBe(0)
  })
})
