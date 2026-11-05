import { ElementRef, Renderer2 } from "@angular/core"
import { TestBed } from "@angular/core/testing"
import { PreferencesService } from "../services/preferences.service"
import { SystemTextSizeService } from "../services/system-text-size.service"
import { createSpyObj, type SpyObj } from "../testing/spy-obj"
import {
  startingFontSize,
  type TextSize,
  UnifiedGesturesDirective,
} from "./unified-gesture.directive"

describe("UnifiedGesturesDirective", () => {
  let element: HTMLElement & {
    name?: string
  }
  let rendererSpy: SpyObj<Renderer2>
  let preferencesServiceSpy: SpyObj<PreferencesService>
  let systemTextSize: SpyObj<SystemTextSizeService>
  let directive: UnifiedGesturesDirective

  beforeEach(() => {
    element = document.createElement("div")
    element.innerHTML = "<h1>Heading</h1>"
    Object.defineProperty(element, "style", {
      value: document.createElement("div").style,
      configurable: true,
    })

    rendererSpy = createSpyObj("Renderer2", [
      "setStyle",
      "addClass",
      "removeClass",
    ])
    preferencesServiceSpy = createSpyObj("PreferencesService", [
      "getFontSize",
      "setFontSize",
      "clearFontSize",
    ])
    preferencesServiceSpy.getFontSize.mockReturnValue(null)
    vi.spyOn(window, "getComputedStyle").mockReturnValue({
      fontSize: "100",
    } as CSSStyleDeclaration)

    systemTextSize = createSpyObj("SystemTextSizeService", ["percent"])
    systemTextSize.percent.mockReturnValue(null)

    TestBed.configureTestingModule({
      providers: [
        { provide: ElementRef, useValue: new ElementRef(element) },
        { provide: Renderer2, useValue: rendererSpy },
        { provide: PreferencesService, useValue: preferencesServiceSpy },
        { provide: SystemTextSizeService, useValue: systemTextSize },
      ],
    })
    directive = TestBed.runInInjectionContext(
      () => new UnifiedGesturesDirective(),
    )
    // No template binds the input here, and signal inputs are not assignable.
    Object.assign(directive, { fontSizeContext: () => "reader" })
  })

  describe("the text size for the Android sheet", () => {
    let stored: number | null
    let sizes: TextSize[]

    beforeEach(() => {
      stored = null
      preferencesServiceSpy.getFontSize.mockImplementation(() => stored)
      preferencesServiceSpy.setFontSize.mockImplementation((size: number) => {
        stored = size
      })
      preferencesServiceSpy.clearFontSize.mockImplementation(() => {
        stored = null
      })
      sizes = []
      directive.textSizeChange.subscribe((size) => sizes.push(size))
    })

    const last = () => sizes[sizes.length - 1]

    it("says the size as the text opens, and as it changes", () => {
      stored = 120
      directive.ngOnInit()
      expect(last()).toEqual({
        percent: 120,
        min: 70,
        max: 235,
        canReset: true,
      })

      directive.increaseFontSize()
      expect(last().percent).toBe(125)
    })

    // Nothing to reset before the reader has chosen a size.
    it("has nothing to reset at the size the text opens at", () => {
      directive.ngOnInit()
      expect(last()).toEqual({
        percent: 100,
        min: 70,
        max: 235,
        canReset: false,
      })
    })

    // 150% was ten taps away in steps of 5.
    it("steps by the sheet's 10, onto its grid", () => {
      stored = 105
      directive.ngOnInit()
      directive.increaseFontSize(10)
      expect(last().percent).toBe(110)
      directive.decreaseFontSize(10)
      expect(last().percent).toBe(100)
      directive.decreaseFontSize(10)
      expect(last().percent).toBe(90)
    })

    // A pinch leaves fractions: 119.6 is shown as 120, and stepped to 120.
    it("steps from the size as shown, not a pinch's fraction", () => {
      stored = 119.6
      directive.ngOnInit()
      expect(last().percent).toBe(120)
      directive.increaseFontSize(10)
      expect(last().percent).toBe(130)

      stored = 120.4
      directive.ngOnInit()
      directive.decreaseFontSize(10)
      expect(last().percent).toBe(110)
    })

    it("stops at either end", () => {
      stored = 230
      directive.ngOnInit()
      directive.increaseFontSize(10)
      expect(last().percent).toBe(235)
      directive.increaseFontSize(10)
      expect(last().percent).toBe(235)
    })

    it("resets to the standard size, forgetting the choice", () => {
      stored = 150
      directive.ngOnInit()
      directive.resetFontSize()

      expect(preferencesServiceSpy.clearFontSize).toHaveBeenCalledWith("reader")
      expect(rendererSpy.setStyle).toHaveBeenCalledWith(
        element,
        "font-size",
        "100%",
      )
      expect(last()).toEqual({
        percent: 100,
        min: 70,
        max: 235,
        canReset: false,
      })
    })

    // The iOS app opens at the iPhone's own text size, and resets to it.
    it("resets to the system's size where the text opens at it", () => {
      stored = 150
      systemTextSize.percent.mockReturnValue(130)
      directive.ngOnInit()
      directive.resetFontSize()
      expect(last().percent).toBe(130)
    })
  })

  it("should register and remove the same touch listeners", () => {
    const addEventListenerSpy = vi.spyOn(element, "addEventListener")
    const removeEventListenerSpy = vi.spyOn(element, "removeEventListener")

    directive.ngOnInit()
    directive.ngOnDestroy()

    expect(vi.mocked(addEventListenerSpy).mock.calls.length).toBe(4)
    expect(vi.mocked(removeEventListenerSpy).mock.calls.length).toBe(4)
    for (let index = 0; index < 4; index++) {
      expect(vi.mocked(removeEventListenerSpy).mock.calls[index][0]).toBe(
        vi.mocked(addEventListenerSpy).mock.calls[index][0],
      )
      expect(vi.mocked(removeEventListenerSpy).mock.calls[index][1]).toBe(
        vi.mocked(addEventListenerSpy).mock.calls[index][1],
      )
    }
  })

  describe("ngOnInit initialization", () => {
    it("should set font size to valid storedSize", () => {
      preferencesServiceSpy.getFontSize.mockReturnValue(120)
      directive.ngOnInit()
      expect(rendererSpy.setStyle).toHaveBeenCalledWith(
        element,
        "font-size",
        "120%",
      )
    })

    it("publishes the scale as a number, for what is sized in pixels", () => {
      preferencesServiceSpy.getFontSize.mockReturnValue(120)

      directive.ngOnInit()

      expect(element.style.getPropertyValue("--reader-text-scale")).toBe("1.2")
    })

    it("should clamp storedSize if it is below MIN_FONT_SIZE", () => {
      preferencesServiceSpy.getFontSize.mockReturnValue(50) // MIN_FONT_SIZE is 70
      directive.ngOnInit()
      expect(rendererSpy.setStyle).toHaveBeenCalledWith(
        element,
        "font-size",
        "70%",
      )
    })

    it("should clamp storedSize if it is above MAX_FONT_SIZE", () => {
      preferencesServiceSpy.getFontSize.mockReturnValue(400) // MAX_FONT_SIZE is 235
      directive.ngOnInit()
      expect(rendererSpy.setStyle).toHaveBeenCalledWith(
        element,
        "font-size",
        "235%",
      )
    })

    // Text stopped at 180%, smaller than the iPhone's accessibility sizes.
    it("keeps a size well past 180%", () => {
      preferencesServiceSpy.getFontSize.mockReturnValue(220)
      directive.ngOnInit()
      expect(rendererSpy.setStyle).toHaveBeenCalledWith(
        element,
        "font-size",
        "220%",
      )
    })

    // At 310% a justified line of a few words spread into wide gaps.
    it("sets text past 180% ragged-right, and back", () => {
      preferencesServiceSpy.getFontSize.mockReturnValue(180)
      directive.ngOnInit()
      expect(rendererSpy.addClass).not.toHaveBeenCalled()

      directive.increaseFontSize()
      expect(rendererSpy.addClass).toHaveBeenCalledWith(element, "large-text")

      directive.decreaseFontSize()
      expect(rendererSpy.removeClass).toHaveBeenCalledWith(
        element,
        "large-text",
      )
    })

    it("grows on past 180% a step at a time", () => {
      preferencesServiceSpy.getFontSize.mockReturnValue(180)
      directive.ngOnInit()
      directive.increaseFontSize()
      expect(rendererSpy.setStyle).toHaveBeenCalledWith(
        element,
        "font-size",
        "185%",
      )
    })

    it("should not call setFontSize and use default if storedSize is missing", () => {
      preferencesServiceSpy.getFontSize.mockReturnValue(null)
      directive.ngOnInit()
      expect(rendererSpy.setStyle).not.toHaveBeenCalled()

      // increasing size starts from default -> 105
      directive.increaseFontSize()
      expect(rendererSpy.setStyle).toHaveBeenCalledWith(
        element,
        "font-size",
        "105%",
      )
    })

    it("should treat 0 as a valid size and clamp it to MIN_FONT_SIZE", () => {
      preferencesServiceSpy.getFontSize.mockReturnValue(0)
      directive.ngOnInit()
      expect(rendererSpy.setStyle).toHaveBeenCalledWith(
        element,
        "font-size",
        "70%",
      )
    })

    it("should fallback to default without calling setFontSize if storedSize is invalid string", () => {
      preferencesServiceSpy.getFontSize.mockReturnValue(
        "invalid" as unknown as number,
      )
      directive.ngOnInit()
      expect(rendererSpy.setStyle).not.toHaveBeenCalled()

      directive.increaseFontSize()
      expect(rendererSpy.setStyle).toHaveBeenCalledWith(
        element,
        "font-size",
        "105%",
      )
    })

    // The iOS app, until a size is chosen in it: the iPhone's text size.
    describe("with no size chosen in the app", () => {
      it("starts from the system's, to the nearest step, without saving it", () => {
        systemTextSize.percent.mockReturnValue(123.5)
        directive.ngOnInit()

        expect(rendererSpy.setStyle).toHaveBeenCalledWith(
          element,
          "font-size",
          "125%",
        )
        expect(preferencesServiceSpy.setFontSize).not.toHaveBeenCalled()

        // Steps go on from there.
        directive.increaseFontSize()
        expect(rendererSpy.setStyle).toHaveBeenCalledWith(
          element,
          "font-size",
          "130%",
        )
      })

      // AX3 is 235% of the body text; AX5, the largest, 312%.
      it("follows the iPhone's accessibility sizes up to AX3", () => {
        systemTextSize.percent.mockReturnValue(235)
        directive.ngOnInit()
        expect(rendererSpy.setStyle).toHaveBeenCalledWith(
          element,
          "font-size",
          "235%",
        )
      })

      it("keeps the largest system sizes within the reader's range", () => {
        systemTextSize.percent.mockReturnValue(312)
        directive.ngOnInit()
        expect(rendererSpy.setStyle).toHaveBeenCalledWith(
          element,
          "font-size",
          "235%",
        )
      })

      it("gives way to a size chosen in the app", () => {
        systemTextSize.percent.mockReturnValue(124)
        preferencesServiceSpy.getFontSize.mockReturnValue(90)
        directive.ngOnInit()

        expect(rendererSpy.setStyle).toHaveBeenCalledWith(
          element,
          "font-size",
          "90%",
        )
        expect(systemTextSize.percent).not.toHaveBeenCalled()
      })
    })
  })

  it("should emit swipeLeft for a fast left swipe", () => {
    vi.spyOn(Date, "now").mockReturnValueOnce(0).mockReturnValueOnce(100)
    const swipeLeftSpy = vi.fn().mockName("swipeLeft")
    directive.swipeLeft.subscribe(swipeLeftSpy)
    ;(directive as unknown as Record<string, (e: TouchEvent) => void>)[
      "onTouchStart"
    ]({
      touches: [{ identifier: 1, clientX: 200, clientY: 10 }],
    } as unknown as TouchEvent)
    ;(directive as unknown as Record<string, (e: TouchEvent) => void>)[
      "onTouchEnd"
    ]({
      changedTouches: [{ identifier: 1, clientX: 0, clientY: 15 }],
    } as unknown as TouchEvent)

    expect(swipeLeftSpy).toHaveBeenCalled()
  })

  // A diagonal flick while scrolling used to change the chapter.
  describe("when a swipe changes the chapter", () => {
    type Point = [x: number, y: number]
    const call = (handler: string, event: object) =>
      (directive as unknown as Record<string, (e: TouchEvent) => void>)[
        handler
      ](event as TouchEvent)
    const touch = ([clientX, clientY]: Point) => ({
      identifier: 1,
      clientX,
      clientY,
    })

    /**
     * A one-finger gesture through `moves`, lifted after `ms`, its points
     * evenly spread in time; or at the given `times`, one per point.
     */
    function gesture(moves: Point[], ms: number | number[]) {
      const times =
        typeof ms === "number"
          ? moves.map((_, i) => (ms * i) / (moves.length - 1))
          : ms
      const now = vi.spyOn(Date, "now")
      for (const time of times) now.mockReturnValueOnce(time)
      const swiped = vi.fn().mockName("swiped")
      directive.swipeLeft.subscribe(swiped)
      directive.swipeRight.subscribe(swiped)
      const moved = vi.fn().mockName("moved")
      directive.swipeMove.subscribe(moved)
      const cancelled = vi.fn().mockName("cancelled")
      directive.swipeCancel.subscribe(cancelled)
      const preventDefault = vi.fn().mockName("preventDefault")
      call("onTouchStart", { touches: [touch(moves[0])] })
      for (const point of moves.slice(1, -1)) {
        call("onTouchMove", { touches: [touch(point)], preventDefault })
      }
      call("onTouchEnd", { changedTouches: [touch(moves[moves.length - 1])] })
      return { swiped, moved, cancelled, preventDefault }
    }

    it("never on a diagonal flick", () => {
      const { swiped } = gesture(
        [
          [200, 300],
          [250, 260],
          [290, 220],
        ],
        100,
      )
      expect(swiped).not.toHaveBeenCalled()
    })

    it("never once the gesture started as a scroll", () => {
      const { swiped } = gesture(
        [
          [200, 300],
          [203, 285],
          [400, 280],
          [420, 280],
        ],
        150,
      )
      expect(swiped).not.toHaveBeenCalled()
    })

    it("on a slow, deliberate drag across a good part of the page", () => {
      const { swiped, preventDefault } = gesture(
        [
          [window.innerWidth * 0.8, 300],
          [window.innerWidth * 0.75, 302],
          [window.innerWidth * 0.4, 310],
        ],
        1500,
      )
      expect(swiped).toHaveBeenCalledTimes(1)
      expect(preventDefault).toHaveBeenCalled()
    })

    it("not on a short, slow drag", () => {
      const { swiped } = gesture(
        [
          [200, 300],
          [215, 300],
          [270, 302],
        ],
        1000,
      )
      expect(swiped).not.toHaveBeenCalled()
    })

    // The whole gesture's average speed rejected a flick made after a pause.
    it("on a flick, however long the finger rested first", () => {
      const { swiped } = gesture(
        [
          [300, 300],
          [295, 300],
          [290, 300],
          [190, 302],
        ],
        [0, 50, 1000, 1080],
      )
      expect(swiped).toHaveBeenCalledTimes(1)
    })

    // Dragged most of the way, then brought back: the reader changed their mind.
    it("not when the finger heads back before letting go", () => {
      const width = window.innerWidth
      const { swiped, cancelled } = gesture(
        [
          [width * 0.9, 300],
          [width * 0.85, 300],
          [width * 0.2, 302],
          [width * 0.45, 302],
        ],
        [0, 50, 600, 660],
      )
      expect(swiped).not.toHaveBeenCalled()
      expect(cancelled).toHaveBeenCalledTimes(1)
    })

    it("not on a finger held still before letting go, short of the distance", () => {
      const { swiped } = gesture(
        [
          [300, 300],
          [290, 300],
          [200, 300],
          [200, 300],
        ],
        [0, 30, 80, 600],
      )
      expect(swiped).not.toHaveBeenCalled()
    })

    it("reports the drag as it goes, from where the finger came down", () => {
      const { moved } = gesture(
        [
          [300, 300],
          [285, 300],
          [240, 302],
          [100, 302],
        ],
        200,
      )
      // Not before the gesture is known to be sideways (12 px).
      expect(vi.mocked(moved).mock.calls).toEqual([[-15], [-60]])
    })

    it("lets nothing follow a scroll", () => {
      const { moved, cancelled } = gesture(
        [
          [200, 300],
          [202, 280],
          [203, 200],
        ],
        300,
      )
      expect(moved).not.toHaveBeenCalled()
      expect(cancelled).not.toHaveBeenCalled()
    })
  })

  it("should persist font size after a pinch gesture", () => {
    const preventDefault = vi.fn().mockName("preventDefault")
    ;(directive as unknown as Record<string, (e: TouchEvent) => void>)[
      "onTouchStart"
    ]({
      touches: [
        { identifier: 1, clientX: 0, clientY: 0 },
        { identifier: 2, clientX: 0, clientY: 100 },
      ],
      preventDefault,
    } as unknown as TouchEvent)
    ;(directive as unknown as Record<string, (e: TouchEvent) => void>)[
      "onTouchMove"
    ]({
      touches: [
        { identifier: 1, clientX: 0, clientY: 0 },
        { identifier: 2, clientX: 0, clientY: 150 },
      ],
      preventDefault,
    } as unknown as TouchEvent)
    ;(directive as unknown as Record<string, (e: TouchEvent) => void>)[
      "onTouchEnd"
    ]({
      changedTouches: [{ identifier: 1, clientX: 0, clientY: 0 }],
    } as unknown as TouchEvent)

    expect(preventDefault).toHaveBeenCalled()
    expect(rendererSpy.setStyle).toHaveBeenCalledWith(
      element,
      "font-size",
      "150%",
    )
    expect(preferencesServiceSpy.setFontSize).toHaveBeenCalledWith(
      150,
      "reader",
    )
  })

  it("should adjust font size with the public helpers", () => {
    directive.increaseFontSize()
    directive.decreaseFontSize()

    expect(vi.mocked(preferencesServiceSpy.setFontSize).mock.calls[0]).toEqual([
      105,
      "reader",
    ])
    expect(vi.mocked(preferencesServiceSpy.setFontSize).mock.calls[1]).toEqual([
      100,
      "reader",
    ])
    expect(vi.mocked(rendererSpy.setStyle).mock.calls[0]).toEqual([
      element,
      "font-size",
      "105%",
    ])
    expect(vi.mocked(rendererSpy.setStyle).mock.calls[2]).toEqual([
      element,
      "font-size",
      "100%",
    ])
  })
})

// The footnotes sheet opens at the reader's size through this rule.
describe("startingFontSize", () => {
  it("takes the size chosen in the app, within the reader's range", () => {
    expect(startingFontSize(125, () => 200)).toBe(125)
    expect(startingFontSize(400, () => null)).toBe(235)
  })

  it("else follows the system's, to the nearest step", () => {
    expect(startingFontSize(null, () => 148)).toBe(150)
  })

  it("else leaves the standard size", () => {
    expect(startingFontSize(null, () => null)).toBeNull()
  })
})
