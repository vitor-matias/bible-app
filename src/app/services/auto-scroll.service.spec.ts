import { AutoScrollService } from "./auto-scroll.service"
import { KeepAwakeService } from "./keep-awake.service"

describe("AutoScrollService", () => {
  let service: AutoScrollService
  let keepAwakeServiceSpy: jasmine.SpyObj<KeepAwakeService>
  let requestAnimationFrameSpy: jasmine.Spy
  let cancelAnimationFrameSpy: jasmine.Spy
  let resizeObserverCallback: ResizeObserverCallback | undefined

  beforeEach(() => {
    keepAwakeServiceSpy = jasmine.createSpyObj("KeepAwakeService", [
      "start",
      "stop",
    ])
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
    ;(service as unknown as Record<string, (timestamp: number) => void>)[
      "stepAutoScroll"
    ](1000)

    expect(service.autoScrollEnabled).toBeFalse()
    expect(keepAwakeServiceSpy.stop).toHaveBeenCalled()
  })

  it("should refresh cached line height when the observer fires", () => {
    const lineHeightElement = document.createElement("div")
    const scrollElement = document.createElement("div")
    spyOn(window, "getComputedStyle").and.returnValue({
      fontSize: "20px",
      lineHeight: "30px",
    } as CSSStyleDeclaration)

    service.start({ scrollElement, lineHeightElement })
    resizeObserverCallback?.([], {} as ResizeObserver)

    expect(
      (service as unknown as Record<string, number>)["cachedLineHeight"],
    ).toBe(30)
  })
})
