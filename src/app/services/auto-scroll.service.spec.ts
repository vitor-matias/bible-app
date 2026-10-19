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

  // VoiceOver read "1/2 ln/s" in the iOS app's toolbar.
  it("says the speed in words", () => {
    expect(service.getAutoScrollSpeedSpokenLabel(1)).toBe("1 linha por segundo")
    expect(service.getAutoScrollSpeedSpokenLabel(1.25)).toBe(
      "1,25 linhas por segundo",
    )
    expect(service.getAutoScrollSpeedSpokenLabel(0.5)).toBe(
      "meia linha por segundo",
    )
    expect(service.getAutoScrollSpeedSpokenLabel(1 / 6)).toBe(
      "um sexto de linha por segundo",
    )
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
    const step = (service as unknown as Record<string, (t: number) => void>)[
      "stepAutoScroll"
    ].bind(service)
    step(1000)
    // A tenth of a second later the page has stood still: play takes it.
    step(1100)

    expect(service.autoScrollEnabled).toBeFalse()
    expect(keepAwakeServiceSpy.stop).toHaveBeenCalled()
  })

  // It stopped 5px short, so the page never counted as read to its end.
  it("finishes at the very end of the page, not a few pixels short", () => {
    const scrollElement = document.createElement("div")
    Object.defineProperties(scrollElement, {
      scrollHeight: { value: 200, configurable: true },
      clientHeight: { value: 100, configurable: true },
      scrollTop: { value: 97, writable: true, configurable: true },
    })

    service.start({ scrollElement })
    const step = (service as unknown as Record<string, (t: number) => void>)[
      "stepAutoScroll"
    ].bind(service)
    step(1000)
    step(1100)

    expect(scrollElement.scrollTop).toBe(100)
    expect(service.autoScrollEnabled).toBeFalse()
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

    // A tenth of a second standing still, then two seconds at 60 frames per
    // second, each frame a fraction of a pixel.
    for (let frame = 0; frame <= 126; frame++) step(frame * (1000 / 60))

    // One line (24px without a line-height element) per second.
    expect(top).toBeGreaterThanOrEqual(46)
    expect(top).toBeLessThanOrEqual(48)
  })

  // Scrolling by hand has to take over: auto-scroll kept pulling the page out
  // from under the reader's finger, wheel or scrollbar.
  describe("when the reader scrolls by hand", () => {
    let top: number
    let height: number
    let onStop: jasmine.Spy
    let step: (timestamp: number) => void

    beforeEach(() => {
      top = 0
      height = 10_000
      onStop = jasmine.createSpy("onStop")
      const scrollElement = document.createElement("div")
      Object.defineProperties(scrollElement, {
        scrollHeight: { get: () => height, configurable: true },
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

    const play = (frames: number, from = 0) => {
      for (let frame = from; frame < from + frames; frame++) {
        step(frame * (1000 / 60))
      }
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

    // A larger text size (pinch, A+) or verses loading above reflow the text,
    // and Chromium's scroll anchoring moves the page to keep the reader's
    // place: that stopped auto-scroll as if they had scrolled.
    it("carries on, from the reader's place, when the text reflows", () => {
      play(60)
      height = 14_000
      top += 400
      const anchored = top

      play(60, 60)

      expect(service.autoScrollEnabled).toBeTrue()
      expect(onStop).not.toHaveBeenCalled()
      expect(top).toBeGreaterThan(anchored)
    })

    it("still stops for the reader after a reflow", () => {
      play(30)
      height = 14_000
      top += 400
      step(600)

      top += 300
      step(700)

      expect(service.autoScrollEnabled).toBeFalse()
    })
  })

  // Regression: on iOS a tap on the native ▶ leaves the text's momentum
  // running, and auto-scroll took that coast for the reader's hand and
  // stopped on its first frame.
  describe("when play is pressed while a flick still carries the page", () => {
    const frameMs = 1000 / 60
    let top: number
    let onStop: jasmine.Spy
    let step: (timestamp: number) => void

    beforeEach(() => {
      top = 5000
      onStop = jasmine.createSpy("onStop")
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
      service.start({ scrollElement, onStop })
      step = (service as unknown as Record<string, (t: number) => void>)[
        "stepAutoScroll"
      ].bind(service)
    })

    /** Moves the page by each distance, a frame apart, as momentum does. */
    const coast = (distances: number[]) => {
      distances.forEach((distance, frame) => {
        top += distance
        step(frame * frameMs)
      })
      return distances.length
    }

    const play = (frames: number, from: number) => {
      for (let frame = from; frame < from + frames; frame++) {
        step(frame * frameMs)
      }
    }

    it("rides the coast out, then scrolls on from where it came to rest", () => {
      // Upwards, slowing down.
      const frames = coast([-40, -30, -22, -15, -9, -5, -2, -1])
      const rest = top

      expect(rest).toBe(5000 - 124)
      expect(service.autoScrollEnabled).toBeTrue()

      play(60, frames)

      expect(service.autoScrollEnabled).toBeTrue()
      expect(onStop).not.toHaveBeenCalled()
      expect(top).toBeGreaterThan(rest)
    })

    it("does not take a frame without news of the coast for its end", () => {
      const frames = coast([-30, 0, -25, 0, 0, -12, 0, -3])

      expect(service.autoScrollEnabled).toBeTrue()
      expect(top).toBe(5000 - 70)

      play(60, frames)

      expect(service.autoScrollEnabled).toBeTrue()
      expect(top).toBeGreaterThan(5000 - 70)
    })

    it("still stops for the reader once it scrolls", () => {
      const frames = coast([-40, -20, -5])
      play(60, frames)
      top -= 300

      step(5000)

      expect(service.autoScrollEnabled).toBeFalse()
      expect(onStop).toHaveBeenCalledTimes(1)
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
