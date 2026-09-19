import { NgZone } from "@angular/core"
import { TestBed } from "@angular/core/testing"
import { Router } from "@angular/router"
import type { URLOpenListenerEvent } from "@capacitor/app"
import { Capacitor, type PluginListenerHandle } from "@capacitor/core"
import { AppComponent } from "./app.component"
import { AnalyticsService } from "./services/analytics.service"
import { OfflineDataService } from "./services/offline-data.service"
import { OnboardingService } from "./services/onboarding.service"
import { APP_PLUGIN } from "./tokens"

describe("AppComponent", () => {
  let routerSpy: jasmine.SpyObj<Router>
  let ngZone: NgZone
  // biome-ignore lint/suspicious/noExplicitAny: Mocking Capacitor plugin
  let mockAppPlugin: jasmine.SpyObj<any>
  let onboardingSpy: jasmine.SpyObj<OnboardingService>

  beforeEach(async () => {
    routerSpy = jasmine.createSpyObj("Router", ["navigateByUrl", "navigate"])
    mockAppPlugin = jasmine.createSpyObj("App", ["addListener"])

    const offlineDataSpy = jasmine.createSpyObj("OfflineDataService", [
      "preloadAllBooksAndChapters",
    ])
    const analyticsSpy = jasmine.createSpyObj("AnalyticsService", ["track"])
    analyticsSpy.track.and.returnValue(Promise.resolve())
    onboardingSpy = jasmine.createSpyObj("OnboardingService", [
      "showOnFirstLaunch",
    ])

    await TestBed.configureTestingModule({
      imports: [AppComponent],
      providers: [
        { provide: Router, useValue: routerSpy },
        { provide: OfflineDataService, useValue: offlineDataSpy },
        { provide: AnalyticsService, useValue: analyticsSpy },
        { provide: APP_PLUGIN, useValue: mockAppPlugin },
        { provide: OnboardingService, useValue: onboardingSpy },
      ],
    }).compileComponents()

    ngZone = TestBed.inject(NgZone)
    spyOn(Capacitor, "isNativePlatform").and.returnValue(true)
  })

  it("should create the app", () => {
    const fixture = TestBed.createComponent(AppComponent)
    const app = fixture.componentInstance
    expect(app).toBeTruthy()
  })

  it("should send app_open event on init", async () => {
    mockAppPlugin.addListener.and.resolveTo({
      remove: async () => {},
    } as unknown as PluginListenerHandle)

    const fixture = TestBed.createComponent(AppComponent)
    fixture.detectChanges()
    await fixture.whenStable()

    const analyticsService = TestBed.inject(AnalyticsService)
    expect(analyticsService.track).toHaveBeenCalledWith("app_open")
  })

  it("should preload books for offline use on init", async () => {
    mockAppPlugin.addListener.and.resolveTo({
      remove: async () => {},
    } as unknown as PluginListenerHandle)

    const fixture = TestBed.createComponent(AppComponent)
    fixture.detectChanges()
    await fixture.whenStable()

    const offlineDataService = TestBed.inject(OfflineDataService)
    expect(offlineDataService.preloadAllBooksAndChapters).toHaveBeenCalledWith(
      "standalone",
    )
  })

  it("should route a title-only share to search with q", async () => {
    mockAppPlugin.addListener.and.resolveTo({
      remove: async () => {},
    } as unknown as PluginListenerHandle)
    const originalUrl = window.location.href
    history.replaceState(null, "", "/?title=Salmo%2023")

    try {
      const fixture = TestBed.createComponent(AppComponent)
      fixture.detectChanges()
      await fixture.whenStable()

      expect(routerSpy.navigate).toHaveBeenCalledWith(["/search"], {
        queryParams: { q: "Salmo 23" },
      })
    } finally {
      history.replaceState(null, "", originalUrl)
    }
  })

  // A share sheet that sends every field emits "" for the empty ones, and ??
  // treats "" as a value — the share then went nowhere.
  it("should route a share with empty text and url to search with the title", async () => {
    mockAppPlugin.addListener.and.resolveTo({
      remove: async () => {},
    } as unknown as PluginListenerHandle)
    const originalUrl = window.location.href
    history.replaceState(null, "", "/?text=&url=&title=Salmo%2023")

    try {
      const fixture = TestBed.createComponent(AppComponent)
      fixture.detectChanges()
      await fixture.whenStable()

      expect(routerSpy.navigate).toHaveBeenCalledWith(["/search"], {
        queryParams: { q: "Salmo 23" },
      })
    } finally {
      history.replaceState(null, "", originalUrl)
    }
  })

  it("should offer the onboarding wizard on first launch", () => {
    mockAppPlugin.addListener.and.resolveTo({
      remove: async () => {},
    } as unknown as PluginListenerHandle)

    const fixture = TestBed.createComponent(AppComponent)
    fixture.detectChanges()

    expect(onboardingSpy.showOnFirstLaunch).toHaveBeenCalled()
  })

  it("should setup app links listener on native platform", () => {
    mockAppPlugin.addListener.and.resolveTo({
      remove: async () => {},
    } as unknown as PluginListenerHandle)

    const fixture = TestBed.createComponent(AppComponent)
    fixture.detectChanges() // triggers ngOnInit

    expect(mockAppPlugin.addListener).toHaveBeenCalledWith(
      "appUrlOpen",
      jasmine.any(Function),
    )
  })

  it("should route to correct path when valid app link is opened", async () => {
    let capturedCallback: (event: URLOpenListenerEvent) => void = () => {}
    mockAppPlugin.addListener.and.callFake(((
      eventName: string,
      callback: (event: URLOpenListenerEvent) => void,
    ) => {
      if (eventName === "appUrlOpen") {
        capturedCallback = callback
      }
      return Promise.resolve({
        remove: async () => {},
      } as unknown as PluginListenerHandle)
      // biome-ignore lint/suspicious/noExplicitAny: Mocking Capacitor plugin
    }) as any)

    const fixture = TestBed.createComponent(AppComponent)
    fixture.detectChanges()

    expect(mockAppPlugin.addListener).toHaveBeenCalledWith(
      "appUrlOpen",
      jasmine.any(Function),
    )

    const mockEvent: URLOpenListenerEvent = {
      url: "https://biblia.capuchinhos.org/book/gn/1?query=test#hash",
    }

    ngZone.run(() => {
      capturedCallback(mockEvent)
    })

    expect(routerSpy.navigateByUrl).toHaveBeenCalledWith(
      "/book/gn/1?query=test#hash",
    )
  })

  it("should not route when invalid domain app link is opened", async () => {
    let capturedCallback: (event: URLOpenListenerEvent) => void = () => {}
    mockAppPlugin.addListener.and.callFake(((
      eventName: string,
      callback: (event: URLOpenListenerEvent) => void,
    ) => {
      if (eventName === "appUrlOpen") {
        capturedCallback = callback
      }
      return Promise.resolve({
        remove: async () => {},
      } as unknown as PluginListenerHandle)
      // biome-ignore lint/suspicious/noExplicitAny: Mocking Capacitor plugin
    }) as any)

    const fixture = TestBed.createComponent(AppComponent)
    fixture.detectChanges()

    expect(mockAppPlugin.addListener).toHaveBeenCalledWith(
      "appUrlOpen",
      jasmine.any(Function),
    )

    const mockEvent: URLOpenListenerEvent = {
      url: "https://other-domain.dev/book/gn/1",
    }

    ngZone.run(() => {
      capturedCallback(mockEvent)
    })

    expect(routerSpy.navigateByUrl).not.toHaveBeenCalled()
  })
})
