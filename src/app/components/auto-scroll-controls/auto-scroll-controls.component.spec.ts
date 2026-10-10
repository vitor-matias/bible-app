import { ComponentFixture, TestBed } from "@angular/core/testing"
import { MatButtonModule } from "@angular/material/button"
import { MatIconModule } from "@angular/material/icon"
import { Subject } from "rxjs"
import { AnalyticsService } from "../../services/analytics.service"
import { AutoScrollService } from "../../services/auto-scroll.service"
import {
  type NativeChromeAction,
  NativeChromeService,
} from "../../services/native-chrome.service"
import { PreferencesService } from "../../services/preferences.service"
import { AutoScrollControlsComponent } from "./auto-scroll-controls.component"

describe("AutoScrollControlsComponent", () => {
  let component: AutoScrollControlsComponent
  let fixture: ComponentFixture<AutoScrollControlsComponent>

  let autoScrollServiceSpy: jasmine.SpyObj<AutoScrollService>
  let preferencesServiceSpy: jasmine.SpyObj<PreferencesService>
  let analyticsServiceSpy: jasmine.SpyObj<AnalyticsService>

  beforeEach(async () => {
    autoScrollServiceSpy = jasmine.createSpyObj("AutoScrollService", [
      "start",
      "stop",
      "updateAutoScrollSpeed",
      "getAutoScrollSpeedLabel",
    ])
    // Mock getters which can't be spied directly using createSpyObj on properties
    Object.defineProperty(autoScrollServiceSpy, "autoScrollEnabled", {
      get: () => false,
      configurable: true,
    })
    Object.defineProperty(autoScrollServiceSpy, "autoScrollLinesPerSecond", {
      get: () => 1,
      configurable: true,
    })
    Object.defineProperty(autoScrollServiceSpy, "AUTO_SCROLL_STEP", {
      get: () => 0.5,
    })
    Object.defineProperty(autoScrollServiceSpy, "MIN_AUTO_SCROLL_LPS", {
      get: () => 0.25,
    })
    Object.defineProperty(autoScrollServiceSpy, "MAX_AUTO_SCROLL_LPS", {
      get: () => 3,
    })

    preferencesServiceSpy = jasmine.createSpyObj("PreferencesService", [
      "setAutoScrollSpeed",
    ])
    analyticsServiceSpy = jasmine.createSpyObj("AnalyticsService", ["track"])
    analyticsServiceSpy.track.and.returnValue(Promise.resolve())

    await TestBed.configureTestingModule({
      imports: [AutoScrollControlsComponent, MatButtonModule, MatIconModule],
      providers: [
        { provide: AutoScrollService, useValue: autoScrollServiceSpy },
        { provide: PreferencesService, useValue: preferencesServiceSpy },
        { provide: AnalyticsService, useValue: analyticsServiceSpy },
      ],
    }).compileComponents()

    fixture = TestBed.createComponent(AutoScrollControlsComponent)
    component = fixture.componentInstance
    fixture.detectChanges()
  })

  it("should create", () => {
    expect(component).toBeTruthy()
  })

  it("should stop scroll on destroy", () => {
    component.ngOnDestroy()
    expect(autoScrollServiceSpy.stop).toHaveBeenCalled()
  })

  describe("toggleAutoScroll", () => {
    it("should start scroll if currently disabled and elements are provided", () => {
      Object.defineProperty(autoScrollServiceSpy, "autoScrollEnabled", {
        get: () => false,
        configurable: true,
      })
      const mockScrollEl = document.createElement("div")
      const mockLineHeightEl = document.createElement("div")

      component.scrollElement = mockScrollEl
      component.lineHeightElement = mockLineHeightEl

      component.toggleAutoScroll()

      expect(autoScrollServiceSpy.start).toHaveBeenCalledWith({
        scrollElement: mockScrollEl,
        lineHeightElement: mockLineHeightEl,
        onStop: jasmine.any(Function),
      })
    })

    it("should NOT start scroll if elements are missing", () => {
      Object.defineProperty(autoScrollServiceSpy, "autoScrollEnabled", {
        get: () => false,
        configurable: true,
      })

      component.scrollElement = undefined
      component.lineHeightElement = undefined

      component.toggleAutoScroll()

      expect(autoScrollServiceSpy.start).not.toHaveBeenCalled()
    })

    it("should stop scroll if currently enabled", () => {
      Object.defineProperty(autoScrollServiceSpy, "autoScrollEnabled", {
        get: () => true,
        configurable: true,
      })

      component.toggleAutoScroll()

      expect(autoScrollServiceSpy.stop).toHaveBeenCalled()
    })

    it("should trigger CDR markForCheck through safeMarkForCheck on onStop callback", () => {
      Object.defineProperty(autoScrollServiceSpy, "autoScrollEnabled", {
        get: () => false,
        configurable: true,
      })
      component.scrollElement = document.createElement("div")
      component.lineHeightElement = document.createElement("div")

      // We want to capture the onStop callback passed to start()
      let stopCallback: (() => void) | undefined
      autoScrollServiceSpy.start.and.callFake((config) => {
        stopCallback = config.onStop
      })

      component.toggleAutoScroll()
      expect(stopCallback).toBeDefined()

      // Should not throw when called
      expect(() => stopCallback?.()).not.toThrow()
    })
  })

  describe("speed controls", () => {
    it("should increase speed", () => {
      autoScrollServiceSpy.updateAutoScrollSpeed.and.returnValue(1.5)

      component.increaseAutoScrollSpeed()

      expect(autoScrollServiceSpy.updateAutoScrollSpeed).toHaveBeenCalledWith(
        0.5,
      )
      expect(preferencesServiceSpy.setAutoScrollSpeed).toHaveBeenCalledWith(1.5)
    })

    it("should decrease speed", () => {
      autoScrollServiceSpy.updateAutoScrollSpeed.and.returnValue(0.5)

      component.decreaseAutoScrollSpeed()

      expect(autoScrollServiceSpy.updateAutoScrollSpeed).toHaveBeenCalledWith(
        -0.5,
      )
      expect(preferencesServiceSpy.setAutoScrollSpeed).toHaveBeenCalledWith(0.5)
    })
  })

  describe("getters", () => {
    it("should surface autoScrollEnabled", () => {
      Object.defineProperty(autoScrollServiceSpy, "autoScrollEnabled", {
        get: () => true,
        configurable: true,
      })
      expect(component.autoScrollEnabled).toBeTrue()
    })

    it("should surface autoScrollLinesPerSecond", () => {
      Object.defineProperty(autoScrollServiceSpy, "autoScrollLinesPerSecond", {
        get: () => 2.5,
        configurable: true,
      })
      expect(component.autoScrollLinesPerSecond).toBe(2.5)
    })

    it("should surface MIN_AUTO_SCROLL_LPS", () => {
      expect(component.MIN_AUTO_SCROLL_LPS).toBe(0.25)
    })

    it("should surface MAX_AUTO_SCROLL_LPS", () => {
      expect(component.MAX_AUTO_SCROLL_LPS).toBe(3)
    })

    it("should delegate array label generation to service", () => {
      autoScrollServiceSpy.getAutoScrollSpeedLabel.and.returnValue("Normal")
      Object.defineProperty(autoScrollServiceSpy, "autoScrollLinesPerSecond", {
        get: () => 1,
        configurable: true,
      })

      expect(component.autoScrollSpeedLabel).toBe("Normal")
      expect(autoScrollServiceSpy.getAutoScrollSpeedLabel).toHaveBeenCalledWith(
        1,
      )
    })
  })
})

describe("AutoScrollControlsComponent in the iOS app", () => {
  let fixture: ComponentFixture<AutoScrollControlsComponent>
  let actions: Subject<NativeChromeAction>
  let nativeChrome: {
    enabled: boolean
    actions$: Subject<NativeChromeAction>
    setAutoScroll: jasmine.Spy
  }
  let autoScroll: jasmine.SpyObj<AutoScrollService>
  let playing: boolean
  let speed: number

  beforeEach(async () => {
    actions = new Subject()
    nativeChrome = {
      enabled: true,
      actions$: actions,
      setAutoScroll: jasmine.createSpy("setAutoScroll"),
    }
    playing = false
    speed = 1
    autoScroll = jasmine.createSpyObj("AutoScrollService", [
      "start",
      "stop",
      "updateAutoScrollSpeed",
      "getAutoScrollSpeedLabel",
    ])
    Object.defineProperties(autoScroll, {
      autoScrollEnabled: { get: () => playing },
      autoScrollLinesPerSecond: { get: () => speed },
      AUTO_SCROLL_STEP: { get: () => 0.25 },
      MIN_AUTO_SCROLL_LPS: { get: () => 0.25 },
      MAX_AUTO_SCROLL_LPS: { get: () => 4 },
    })
    autoScroll.getAutoScrollSpeedLabel.and.callFake((value) => String(value))
    autoScroll.start.and.callFake(() => {
      playing = true
    })
    autoScroll.updateAutoScrollSpeed.and.callFake((delta) => {
      speed += delta
      return speed
    })
    const analytics = jasmine.createSpyObj("AnalyticsService", ["track"])
    analytics.track.and.resolveTo()

    await TestBed.configureTestingModule({
      imports: [AutoScrollControlsComponent],
      providers: [
        { provide: NativeChromeService, useValue: nativeChrome },
        { provide: AutoScrollService, useValue: autoScroll },
        {
          provide: PreferencesService,
          useValue: jasmine.createSpyObj(["setAutoScrollSpeed"]),
        },
        { provide: AnalyticsService, useValue: analytics },
      ],
    }).compileComponents()

    fixture = TestBed.createComponent(AutoScrollControlsComponent)
    fixture.componentRef.setInput(
      "scrollElement",
      document.createElement("div"),
    )
    fixture.componentRef.setInput(
      "lineHeightElement",
      document.createElement("div"),
    )
    fixture.detectChanges()
  })

  const lastState = () => nativeChrome.setAutoScroll.calls.mostRecent().args[0]

  it("draws no web controls; the toolbar shows them", () => {
    expect(
      fixture.nativeElement.querySelector(".auto-scroll-controls"),
    ).toBeNull()
    expect(lastState()).toEqual({
      playing: false,
      speedLabel: "1 ln/s",
      canSlower: true,
      canFaster: true,
    })
  })

  it("plays and pauses from the toolbar", () => {
    actions.next({ id: "auto-scroll-toggle" })
    expect(autoScroll.start).toHaveBeenCalled()
    expect(lastState()).toEqual(jasmine.objectContaining({ playing: true }))

    actions.next({ id: "auto-scroll-toggle" })
    expect(autoScroll.stop).toHaveBeenCalled()
  })

  it("changes speed from the toolbar, down to the slowest", () => {
    actions.next({ id: "auto-scroll-faster" })
    expect(lastState()).toEqual(
      jasmine.objectContaining({ speedLabel: "1.25 ln/s" }),
    )

    for (let i = 0; i < 4; i++) actions.next({ id: "auto-scroll-slower" })
    expect(lastState()).toEqual(
      jasmine.objectContaining({ speedLabel: "0.25 ln/s", canSlower: false }),
    )
  })

  it("gives the toolbar back when closed", () => {
    fixture.destroy()
    expect(lastState()).toBeNull()
  })
})
