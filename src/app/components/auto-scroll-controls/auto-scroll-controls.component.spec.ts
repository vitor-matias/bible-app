import { ComponentFixture, TestBed } from "@angular/core/testing"
import { MatButtonModule } from "@angular/material/button"
import { MatIconModule } from "@angular/material/icon"
import { AutoScrollService } from "../../services/auto-scroll.service"
import { PreferencesService } from "../../services/preferences.service"
import { AutoScrollControlsComponent } from "./auto-scroll-controls.component"

describe("AutoScrollControlsComponent", () => {
  let component: AutoScrollControlsComponent
  let fixture: ComponentFixture<AutoScrollControlsComponent>

  let autoScrollServiceSpy: jasmine.SpyObj<AutoScrollService>
  let preferencesServiceSpy: jasmine.SpyObj<PreferencesService>

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

    await TestBed.configureTestingModule({
      imports: [AutoScrollControlsComponent, MatButtonModule, MatIconModule],
      providers: [
        { provide: AutoScrollService, useValue: autoScrollServiceSpy },
        { provide: PreferencesService, useValue: preferencesServiceSpy },
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
      expect(() => stopCallback!()).not.toThrow()
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
