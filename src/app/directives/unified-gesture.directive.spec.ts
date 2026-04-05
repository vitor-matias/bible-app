import { ElementRef, Renderer2 } from "@angular/core"
import { PreferencesService } from "../services/preferences.service"
import { UnifiedGesturesDirective } from "./unified-gesture.directive"

describe("UnifiedGesturesDirective", () => {
  let element: HTMLElement & { name?: string }
  let rendererSpy: jasmine.SpyObj<Renderer2>
  let preferencesServiceSpy: jasmine.SpyObj<PreferencesService>
  let directive: UnifiedGesturesDirective

  beforeEach(() => {
    element = document.createElement("div")
    element.innerHTML = "<h1>Heading</h1>"
    Object.defineProperty(element, "style", {
      value: document.createElement("div").style,
      configurable: true,
    })

    rendererSpy = jasmine.createSpyObj("Renderer2", ["setStyle"])
    preferencesServiceSpy = jasmine.createSpyObj("PreferencesService", [
      "getFontSize",
      "setFontSize",
    ])
    preferencesServiceSpy.getFontSize.and.returnValue(null)
    spyOn(window, "getComputedStyle").and.returnValue({
      fontSize: "100",
    } as CSSStyleDeclaration)

    directive = new UnifiedGesturesDirective(
      new ElementRef(element),
      rendererSpy,
      preferencesServiceSpy,
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
