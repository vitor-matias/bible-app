import { AutoScrollService } from "./auto-scroll.service"
import { KeepAwakeService } from "./keep-awake.service"

describe("AutoScrollService", () => {
  let service: AutoScrollService
  let keepAwakeServiceSpy: jasmine.SpyObj<KeepAwakeService>
  let requestAnimationFrameSpy: jasmine.Spy
  let cancelAnimationFrameSpy: jasmine.Spy
  let resizeObserverCallback: ResizeObserverCallback | undefined
  let originalResizeObserver: typeof ResizeObserver | undefined

  beforeEach(() => {
    keepAwakeServiceSpy = jasmine.createSpyObj("KeepAwakeService", [
      "start",
      "stop",
    ])
    originalResizeObserver = globalThis.ResizeObserver
    resizeObserverCallback = undefined
    requestAnimationFrameSpy = spyOn(
      window,
      "requestAnimationFrame",
    ).and.returnValue(42)
    cancelAnimationFrameSpy = spyOn(window, "cancelAnimationFrame")
    ;(
      globalThis as typeof globalThis & {
        ResizeObserver: typeof ResizeObserver
      }
    ).ResizeObserver = class {
      constructor(callback: ResizeObserverCallback) {
        resizeObserverCallback = callback
      }

      observe(): void {}

      unobserve(): void {}

      disconnect(): void {}
    } as unknown as typeof ResizeObserver

    service = new AutoScrollService(keepAwakeServiceSpy)
  })

  afterEach(() => {
    if (originalResizeObserver) {
      globalThis.ResizeObserver = originalResizeObserver
    } else {
      delete (globalThis as { ResizeObserver?: typeof ResizeObserver })
        .ResizeObserver
    }
  })

  it("should clamp auto scroll speed to the supported range", () => {
    expect(service.setAutoScrollLinesPerSecond(10)).toBe(
      service.MAX_AUTO_SCROLL_LPS,
    )
    expect(service.setAutoScrollLinesPerSecond(0)).toBeCloseTo(
      service.MIN_AUTO_SCROLL_LPS,
      4,
    )
  })

  it("should move through fractional presets before whole-number steps", () => {
    service.setAutoScrollLinesPerSecond(0.5)

    expect(service.updateAutoScrollSpeed(1)).toBeCloseTo(2 / 3, 4)
    expect(service.updateAutoScrollSpeed(-1)).toBeCloseTo(0.5, 4)
  })

  it("should return fractional labels for slow speeds", () => {
    expect(service.getAutoScrollSpeedLabel(0.5)).toBe("1/2")
    expect(service.getAutoScrollSpeedLabel(1.25)).toBe("1.25")
  })

  it("should start scrolling, observe line height changes, and stop cleanly", () => {
    const scrollElement = document.createElement("div")
    const lineHeightElement = document.createElement("div")
    const onStop = jasmine.createSpy("onStop")

    service.start({ scrollElement, lineHeightElement, onStop })

    expect(service.autoScrollEnabled).toBeTrue()
    expect(keepAwakeServiceSpy.start).toHaveBeenCalled()
    expect(requestAnimationFrameSpy).toHaveBeenCalled()

    service.stop()

    expect(service.autoScrollEnabled).toBeFalse()
    expect(cancelAnimationFrameSpy).toHaveBeenCalledWith(42)
    expect(keepAwakeServiceSpy.stop).toHaveBeenCalled()
    expect(onStop).toHaveBeenCalled()
  })

  it("should do nothing when started without a scroll element", () => {
    service.start({ scrollElement: null })

    expect(service.autoScrollEnabled).toBeFalse()
    expect(keepAwakeServiceSpy.start).not.toHaveBeenCalled()
    expect(requestAnimationFrameSpy).not.toHaveBeenCalled()
  })

  it("should stop automatically when the content reaches the bottom", () => {
    const scrollElement = document.createElement("div")
    Object.defineProperties(scrollElement, {
      scrollHeight: { value: 200, configurable: true },
      clientHeight: { value: 100, configurable: true },
      scrollTop: { value: 97, writable: true, configurable: true },
    })

    service.start({ scrollElement })
    // Drive the timer step directly so the test can deterministically simulate
    // requestAnimationFrame progress without waiting on browser scheduling.
    ;(service as unknown as Record<string, (timestamp: number) => void>)[
      "stepAutoScroll"
    ](1000)

    expect(service.autoScrollEnabled).toBeFalse()
    expect(keepAwakeServiceSpy.stop).toHaveBeenCalled()
  })

  // Regression: WebKit keeps scrollTop in whole pixels. Applying half a pixel
  // per frame and discarding the rest left the iOS app's text standing still.
  it("advances where the browser only scrolls whole pixels", () => {
    let top = 0
    const scrollElement = document.createElement("div")
    Object.defineProperties(scrollElement, {
      scrollHeight: { value: 10_000, configurable: true },
      clientHeight: { value: 500, configurable: true },
      scrollTop: {
        get: () => top,
        set: (value: number) => {
          top = Math.floor(value)
        },
        configurable: true,
      },
    })
    service.setAutoScrollLinesPerSecond(1)
    service.start({ scrollElement })
    const step = (service as unknown as Record<string, (t: number) => void>)[
      "stepAutoScroll"
    ].bind(service)

    // Two seconds at 60 frames per second, each frame a fraction of a pixel.
    for (let frame = 0; frame <= 120; frame++) step(frame * (1000 / 60))

    // One line (24px without a line-height element) per second.
    expect(top).toBeGreaterThanOrEqual(46)
    expect(top).toBeLessThanOrEqual(48)
  })

  // Scrolling by hand has to take over: auto-scroll kept pulling the page out
  // from under the reader's finger, wheel or scrollbar.
  describe("when the reader scrolls by hand", () => {
    let top: number
    let onStop: jasmine.Spy
    let step: (timestamp: number) => void

    beforeEach(() => {
      top = 0
      onStop = jasmine.createSpy("onStop")
      const scrollElement = document.createElement("div")
      Object.defineProperties(scrollElement, {
        scrollHeight: { value: 10_000, configurable: true },
        clientHeight: { value: 500, configurable: true },
        // Whole pixels, as WebKit holds them.
        scrollTop: {
          get: () => top,
          set: (value: number) => {
            top = Math.floor(value)
          },
          configurable: true,
        },
      })
      service.setAutoScrollLinesPerSecond(1)
      service.start({ scrollElement, onStop })
      step = (service as unknown as Record<string, (t: number) => void>)[
        "stepAutoScroll"
      ].bind(service)
    })

    const play = (frames: number) => {
      for (let frame = 0; frame < frames; frame++) step(frame * (1000 / 60))
    }

    it("keeps going while only auto-scroll moves the page", () => {
      play(120)

      expect(top).toBeGreaterThan(40)
      expect(service.autoScrollEnabled).toBeTrue()
      expect(onStop).not.toHaveBeenCalled()
    })

    it("stops, and leaves the page where they put it", () => {
      play(60)
      top += 300 // a finger, the wheel, a key or the scrollbar
      const where = top

      step(2000)

      expect(service.autoScrollEnabled).toBeFalse()
      expect(onStop).toHaveBeenCalledTimes(1)
      expect(keepAwakeServiceSpy.stop).toHaveBeenCalled()
      expect(top).toBe(where)
    })

    it("stops when they scroll back up as well", () => {
      play(60)
      top -= 10

      step(2000)

      expect(service.autoScrollEnabled).toBeFalse()
    })

    it("does not take a pixel of rounding for the reader", () => {
      play(30)
      top += 1

      step(2000)

      expect(service.autoScrollEnabled).toBeTrue()
    })
  })

  it("should refresh cached line height when the observer fires", () => {
    const lineHeightElement = document.createElement("div")
    const scrollElement = document.createElement("div")
    spyOn(window, "getComputedStyle").and.returnValue({
      fontSize: "20px",
      lineHeight: "30px",
    } as CSSStyleDeclaration)

    service.start({ scrollElement, lineHeightElement })
    const callback = resizeObserverCallback
    expect(callback).toBeDefined()
    if (!callback) {
      throw new Error("ResizeObserver callback was not registered")
    }
    callback([], {} as ResizeObserver)

    expect(
      (service as unknown as Record<string, number>)["cachedLineHeight"],
    ).toBe(30)
  })
})
