import { ElementRef, Renderer2 } from "@angular/core"
import { PreferencesService } from "../services/preferences.service"
import type { SystemTextSizeService } from "../services/system-text-size.service"
import { UnifiedGesturesDirective } from "./unified-gesture.directive"

describe("UnifiedGesturesDirective", () => {
  let element: HTMLElement & { name?: string }
  let rendererSpy: jasmine.SpyObj<Renderer2>
  let preferencesServiceSpy: jasmine.SpyObj<PreferencesService>
  let systemTextSize: jasmine.SpyObj<SystemTextSizeService>
  let directive: UnifiedGesturesDirective

  beforeEach(() => {
    element = document.createElement("div")
    element.innerHTML = "<h1>Heading</h1>"
    Object.defineProperty(element, "style", {
      value: document.createElement("div").style,
      configurable: true,
    })

    rendererSpy = jasmine.createSpyObj("Renderer2", [
      "setStyle",
      "addClass",
      "removeClass",
    ])
    preferencesServiceSpy = jasmine.createSpyObj("PreferencesService", [
      "getFontSize",
      "setFontSize",
    ])
    preferencesServiceSpy.getFontSize.and.returnValue(null)
    spyOn(window, "getComputedStyle").and.returnValue({
      fontSize: "100",
    } as CSSStyleDeclaration)

    systemTextSize = jasmine.createSpyObj("SystemTextSizeService", ["percent"])
    systemTextSize.percent.and.returnValue(null)

    directive = new UnifiedGesturesDirective(
      new ElementRef(element),
      rendererSpy,
      preferencesServiceSpy,
      systemTextSize,
    )
    directive.fontSizeContext = "reader"
  })

  it("should register and remove the same touch listeners", () => {
    const addEventListenerSpy = spyOn(
      element,
      "addEventListener",
    ).and.callThrough()
    const removeEventListenerSpy = spyOn(
      element,
      "removeEventListener",
    ).and.callThrough()

    directive.ngOnInit()
    directive.ngOnDestroy()

    expect(addEventListenerSpy.calls.count()).toBe(4)
    expect(removeEventListenerSpy.calls.count()).toBe(4)
    for (let index = 0; index < 4; index++) {
      expect(removeEventListenerSpy.calls.argsFor(index)[0]).toBe(
        addEventListenerSpy.calls.argsFor(index)[0],
      )
      expect(removeEventListenerSpy.calls.argsFor(index)[1]).toBe(
        addEventListenerSpy.calls.argsFor(index)[1],
      )
    }
  })

  describe("ngOnInit initialization", () => {
    it("should set font size to valid storedSize", () => {
      preferencesServiceSpy.getFontSize.and.returnValue(120)
      directive.ngOnInit()
      expect(rendererSpy.setStyle).toHaveBeenCalledWith(
        element,
        "font-size",
        "120%",
      )
    })

    it("should clamp storedSize if it is below MIN_FONT_SIZE", () => {
      preferencesServiceSpy.getFontSize.and.returnValue(50) // MIN_FONT_SIZE is 70
      directive.ngOnInit()
      expect(rendererSpy.setStyle).toHaveBeenCalledWith(
        element,
        "font-size",
        "70%",
      )
    })

    it("should clamp storedSize if it is above MAX_FONT_SIZE", () => {
      preferencesServiceSpy.getFontSize.and.returnValue(400) // MAX_FONT_SIZE is 235
      directive.ngOnInit()
      expect(rendererSpy.setStyle).toHaveBeenCalledWith(
        element,
        "font-size",
        "235%",
      )
    })

    // Text stopped at 180%, smaller than the iPhone's accessibility sizes.
    it("keeps a size well past 180%", () => {
      preferencesServiceSpy.getFontSize.and.returnValue(220)
      directive.ngOnInit()
      expect(rendererSpy.setStyle).toHaveBeenCalledWith(
        element,
        "font-size",
        "220%",
      )
    })

    // At 310% a justified line of a few words spread into wide gaps.
    it("sets text past 180% ragged-right, and back", () => {
      preferencesServiceSpy.getFontSize.and.returnValue(180)
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
      preferencesServiceSpy.getFontSize.and.returnValue(180)
      directive.ngOnInit()
      directive.increaseFontSize()
      expect(rendererSpy.setStyle).toHaveBeenCalledWith(
        element,
        "font-size",
        "185%",
      )
    })

    it("should not call setFontSize and use default if storedSize is missing", () => {
      preferencesServiceSpy.getFontSize.and.returnValue(null)
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
      preferencesServiceSpy.getFontSize.and.returnValue(0)
      directive.ngOnInit()
      expect(rendererSpy.setStyle).toHaveBeenCalledWith(
        element,
        "font-size",
        "70%",
      )
    })

    it("should fallback to default without calling setFontSize if storedSize is invalid string", () => {
      preferencesServiceSpy.getFontSize.and.returnValue(
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
        systemTextSize.percent.and.returnValue(123.5)
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
        systemTextSize.percent.and.returnValue(235)
        directive.ngOnInit()
        expect(rendererSpy.setStyle).toHaveBeenCalledWith(
          element,
          "font-size",
          "235%",
        )
      })

      it("keeps the largest system sizes within the reader's range", () => {
        systemTextSize.percent.and.returnValue(312)
        directive.ngOnInit()
        expect(rendererSpy.setStyle).toHaveBeenCalledWith(
          element,
          "font-size",
          "235%",
        )
      })

      it("gives way to a size chosen in the app", () => {
        systemTextSize.percent.and.returnValue(124)
        preferencesServiceSpy.getFontSize.and.returnValue(90)
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
    spyOn(Date, "now").and.returnValues(0, 100)
    const swipeLeftSpy = jasmine.createSpy("swipeLeft")
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
      spyOn(Date, "now").and.returnValues(...times)
      const swiped = jasmine.createSpy("swiped")
      directive.swipeLeft.subscribe(swiped)
      directive.swipeRight.subscribe(swiped)
      const moved = jasmine.createSpy("moved")
      directive.swipeMove.subscribe(moved)
      const cancelled = jasmine.createSpy("cancelled")
      directive.swipeCancel.subscribe(cancelled)
      const preventDefault = jasmine.createSpy("preventDefault")
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
      expect(moved.calls.allArgs()).toEqual([[-15], [-60]])
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
    const preventDefault = jasmine.createSpy("preventDefault")

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

    expect(preferencesServiceSpy.setFontSize.calls.argsFor(0)).toEqual([
      105,
      "reader",
    ])
    expect(preferencesServiceSpy.setFontSize.calls.argsFor(1)).toEqual([
      100,
      "reader",
    ])
    expect(rendererSpy.setStyle.calls.argsFor(0)).toEqual([
      element,
      "font-size",
      "105%",
    ])
    expect(rendererSpy.setStyle.calls.argsFor(2)).toEqual([
      element,
      "font-size",
      "100%",
    ])
  })
})
