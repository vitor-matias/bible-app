import { TestBed } from "@angular/core/testing"
import { AnalyticsService } from "./analytics.service"
import { PreferencesService } from "./preferences.service"
import { ThemeService } from "./theme.service"

describe("ThemeService", () => {
  let service: ThemeService
  let prefsSpy: jasmine.SpyObj<PreferencesService>
  let classListToggleSpy: jasmine.Spy

  beforeEach(() => {
    prefsSpy = jasmine.createSpyObj("PreferencesService", [
      "getTheme",
      "setTheme",
    ])
    prefsSpy.getTheme.and.returnValue(null)

    classListToggleSpy = spyOn(document.documentElement.classList, "toggle")

    const analyticsSpy = jasmine.createSpyObj("AnalyticsService", ["track"])
    analyticsSpy.track.and.returnValue(Promise.resolve())

    TestBed.configureTestingModule({
      providers: [
        ThemeService,
        { provide: PreferencesService, useValue: prefsSpy },
        { provide: AnalyticsService, useValue: analyticsSpy },
      ],
    })
  })

  function createService(): ThemeService {
    return TestBed.inject(ThemeService)
  }

  it("should be created", () => {
    service = createService()
    expect(service).toBeTruthy()
  })

  it("should default to system theme when no saved preference", () => {
    prefsSpy.getTheme.and.returnValue(null)
    service = createService()
    expect(service.currentMode).toBe("system")
  })

  it("should restore saved theme from preferences", () => {
    prefsSpy.getTheme.and.returnValue("dark")
    service = createService()
    expect(service.currentMode).toBe("dark")
  })

  it("should apply dark-theme class when mode is dark", () => {
    prefsSpy.getTheme.and.returnValue("dark")
    service = createService()
    expect(classListToggleSpy).toHaveBeenCalledWith("dark-theme", true)
  })

  it("should apply light theme (no dark-theme class) when mode is light", () => {
    prefsSpy.getTheme.and.returnValue("light")
    service = createService()
    expect(classListToggleSpy).toHaveBeenCalledWith("dark-theme", false)
  })

  it("should cycle through themes on toggleTheme", () => {
    prefsSpy.getTheme.and.returnValue("light")
    service = createService()
    const analyticsSpy = TestBed.inject(
      AnalyticsService,
    ) as jasmine.SpyObj<AnalyticsService>

    // light -> dark
    service.toggleTheme()
    expect(service.currentMode).toBe("dark")
    expect(prefsSpy.setTheme).toHaveBeenCalledWith("dark")
    expect(analyticsSpy.track).toHaveBeenCalledWith("theme-dark")

    // dark -> system
    service.toggleTheme()
    expect(service.currentMode).toBe("system")
    expect(prefsSpy.setTheme).toHaveBeenCalledWith("system")
    expect(analyticsSpy.track).toHaveBeenCalledWith("theme-system")

    // system -> light
    service.toggleTheme()
    expect(service.currentMode).toBe("light")
    expect(prefsSpy.setTheme).toHaveBeenCalledWith("light")
    expect(analyticsSpy.track).toHaveBeenCalledWith("theme-light")
  })

  it("should emit theme mode changes through themeMode$", () => {
    prefsSpy.getTheme.and.returnValue("light")
    service = createService()
    const analyticsSpy = TestBed.inject(
      AnalyticsService,
    ) as jasmine.SpyObj<AnalyticsService>

    const emitted: string[] = []
    service.themeMode$.subscribe((mode) => emitted.push(mode))

    service.toggleTheme() // -> dark
    expect(analyticsSpy.track).toHaveBeenCalledWith("theme-dark")

    service.toggleTheme() // -> system
    expect(analyticsSpy.track).toHaveBeenCalledWith("theme-system")

    expect(emitted).toEqual(["light", "dark", "system"])
  })

  it("should use addEventListener when available (modern browsers)", () => {
    const mockMql = {
      matches: false,
      addEventListener: jasmine.createSpy("addEventListener"),
      addListener: jasmine.createSpy("addListener"),
    }
    spyOn(window, "matchMedia").and.returnValue(
      mockMql as unknown as MediaQueryList,
    )

    prefsSpy.getTheme.and.returnValue(null)
    // Need a new instance to trigger the constructor with the mocked matchMedia
    service = new ThemeService(prefsSpy, TestBed.inject(AnalyticsService))

    expect(mockMql.addEventListener).toHaveBeenCalledWith(
      "change",
      jasmine.any(Function),
    )
    expect(mockMql.addListener).not.toHaveBeenCalled()
  })

  it("should fall back to addListener when addEventListener is not available", () => {
    const mockMql = {
      matches: false,
      addEventListener: undefined,
      addListener: jasmine.createSpy("addListener"),
    }
    spyOn(window, "matchMedia").and.returnValue(
      mockMql as unknown as MediaQueryList,
    )

    prefsSpy.getTheme.and.returnValue(null)
    service = new ThemeService(prefsSpy, TestBed.inject(AnalyticsService))

    expect(mockMql.addListener).toHaveBeenCalledWith(jasmine.any(Function))
  })

  it("should update theme when system preference changes while in system mode", () => {
    let changeHandler: (() => void) | undefined
    const mockMql = {
      matches: true,
      addEventListener: (_event: string, handler: () => void) => {
        changeHandler = handler
      },
      addListener: jasmine.createSpy("addListener"),
    }
    spyOn(window, "matchMedia").and.returnValue(
      mockMql as unknown as MediaQueryList,
    )

    prefsSpy.getTheme.and.returnValue("system")
    service = new ThemeService(prefsSpy, TestBed.inject(AnalyticsService))

    classListToggleSpy.calls.reset()
    changeHandler?.()

    expect(classListToggleSpy).toHaveBeenCalledWith("dark-theme", true)
  })

  it("should NOT update theme when system preference changes while in non-system mode", () => {
    let changeHandler: (() => void) | undefined
    const mockMql = {
      matches: true,
      addEventListener: (_event: string, handler: () => void) => {
        changeHandler = handler
      },
      addListener: jasmine.createSpy("addListener"),
    }
    spyOn(window, "matchMedia").and.returnValue(
      mockMql as unknown as MediaQueryList,
    )

    prefsSpy.getTheme.and.returnValue("dark")
    service = new ThemeService(prefsSpy, TestBed.inject(AnalyticsService))

    classListToggleSpy.calls.reset()
    changeHandler?.()

    // Should not have been called again since mode is "dark", not "system"
    expect(classListToggleSpy).not.toHaveBeenCalled()
  })
})
