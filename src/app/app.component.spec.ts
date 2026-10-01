import { NgZone } from "@angular/core"
import { TestBed } from "@angular/core/testing"
import { MatDialog, type MatDialogRef } from "@angular/material/dialog"
import { Router } from "@angular/router"
import type {
  BackButtonListenerEvent,
  URLOpenListenerEvent,
} from "@capacitor/app"
import { Capacitor, type PluginListenerHandle } from "@capacitor/core"
import { AppComponent } from "./app.component"
import { AnalyticsService } from "./services/analytics.service"
import { BackButtonService } from "./services/back-button.service"
import { NativeShellService } from "./services/native-shell.service"
import { OfflineDataService } from "./services/offline-data.service"
import { OnboardingService } from "./services/onboarding.service"
import { APP_PLUGIN } from "./tokens"

describe("AppComponent", () => {
  let routerSpy: jasmine.SpyObj<Router>
  let ngZone: NgZone
  // biome-ignore lint/suspicious/noExplicitAny: Mocking Capacitor plugin
  let mockAppPlugin: jasmine.SpyObj<any>
  let onboardingSpy: jasmine.SpyObj<OnboardingService>
  let nativeShellSpy: jasmine.SpyObj<NativeShellService>
  let dialogStub: { openDialogs: MatDialogRef<unknown>[] }

  beforeEach(async () => {
    routerSpy = jasmine.createSpyObj("Router", ["navigateByUrl", "navigate"])
    mockAppPlugin = jasmine.createSpyObj("App", ["addListener", "minimizeApp"])
    dialogStub = { openDialogs: [] }

    const offlineDataSpy = jasmine.createSpyObj("OfflineDataService", [
      "preloadAllBooksAndChapters",
    ])
    const analyticsSpy = jasmine.createSpyObj("AnalyticsService", ["track"])
    analyticsSpy.track.and.returnValue(Promise.resolve())
    onboardingSpy = jasmine.createSpyObj("OnboardingService", [
      "showOnFirstLaunch",
    ])

    nativeShellSpy = jasmine.createSpyObj("NativeShellService", ["init"])

    await TestBed.configureTestingModule({
      imports: [AppComponent],
      providers: [
        { provide: Router, useValue: routerSpy },
        { provide: OfflineDataService, useValue: offlineDataSpy },
        { provide: AnalyticsService, useValue: analyticsSpy },
        { provide: APP_PLUGIN, useValue: mockAppPlugin },
        { provide: OnboardingService, useValue: onboardingSpy },
        { provide: MatDialog, useValue: dialogStub },
        { provide: NativeShellService, useValue: nativeShellSpy },
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

  describe("Vercel Speed Insights", () => {
    const speedInsightsScripts = () =>
      document.head.querySelectorAll('script[src*="speed-insights"]')

    beforeEach(() => {
      for (const script of Array.from(speedInsightsScripts())) script.remove()
    })

    it("is not loaded in the native apps", () => {
      TestBed.createComponent(AppComponent)
      expect(speedInsightsScripts().length).toBe(0)
    })

    it("is loaded on the web", () => {
      ;(Capacitor.isNativePlatform as jasmine.Spy).and.returnValue(false)
      TestBed.createComponent(AppComponent)
      expect(speedInsightsScripts().length).toBe(1)
    })
  })

  it("should set up the native shell on init", () => {
    mockAppPlugin.addListener.and.resolveTo({
      remove: async () => {},
    } as unknown as PluginListenerHandle)

    TestBed.createComponent(AppComponent).detectChanges()

    expect(nativeShellSpy.init).toHaveBeenCalled()
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

  describe("Android back button", () => {
    let backButton: (event: BackButtonListenerEvent) => void

    beforeEach(() => {
      backButton = () => fail("backButton listener was not registered")
      mockAppPlugin.addListener.and.callFake(((
        eventName: string,
        callback: (event: BackButtonListenerEvent) => void,
      ) => {
        if (eventName === "backButton") backButton = callback
        return Promise.resolve({
          remove: async () => {},
        } as unknown as PluginListenerHandle)
        // biome-ignore lint/suspicious/noExplicitAny: Mocking Capacitor plugin
      }) as any)
      TestBed.createComponent(AppComponent).detectChanges()
    })

    it("closes the topmost dialog first", () => {
      const lower = jasmine.createSpyObj<MatDialogRef<unknown>>(["close"])
      const top = jasmine.createSpyObj<MatDialogRef<unknown>>(["close"])
      dialogStub.openDialogs = [lower, top]
      const closePanel = jasmine.createSpy("closePanel").and.returnValue(true)
      const unregister = TestBed.inject(BackButtonService).register(closePanel)
      const historyBack = spyOn(window.history, "back")

      backButton({ canGoBack: true })

      expect(top.close).toHaveBeenCalled()
      expect(lower.close).not.toHaveBeenCalled()
      expect(closePanel).not.toHaveBeenCalled()
      expect(historyBack).not.toHaveBeenCalled()
      unregister()
    })

    it("goes back in history when it can", () => {
      const historyBack = spyOn(window.history, "back")

      backButton({ canGoBack: true })

      expect(historyBack).toHaveBeenCalled()
      expect(mockAppPlugin.minimizeApp).not.toHaveBeenCalled()
    })

    it("closes a registered panel, such as the book drawer, before going back", () => {
      const closeDrawer = jasmine.createSpy("closeDrawer").and.returnValue(true)
      const unregister = TestBed.inject(BackButtonService).register(closeDrawer)
      const historyBack = spyOn(window.history, "back")

      backButton({ canGoBack: true })

      expect(closeDrawer).toHaveBeenCalled()
      expect(historyBack).not.toHaveBeenCalled()
      unregister()
    })

    it("sends the app to the background from the first screen", () => {
      const historyBack = spyOn(window.history, "back")

      backButton({ canGoBack: false })

      expect(historyBack).not.toHaveBeenCalled()
      expect(mockAppPlugin.minimizeApp).toHaveBeenCalled()
    })
  })

  describe("shares from other apps", () => {
    let openUrl: (url: string) => void

    beforeEach(() => {
      let capturedCallback: (event: URLOpenListenerEvent) => void = () => {}
      mockAppPlugin.addListener.and.callFake(((
        eventName: string,
        callback: (event: URLOpenListenerEvent) => void,
      ) => {
        if (eventName === "appUrlOpen") capturedCallback = callback
        return Promise.resolve({
          remove: async () => {},
        } as unknown as PluginListenerHandle)
        // biome-ignore lint/suspicious/noExplicitAny: Mocking Capacitor plugin
      }) as any)
      TestBed.createComponent(AppComponent).detectChanges()
      openUrl = (url) => ngZone.run(() => capturedCallback({ url }))
    })

    // MainActivity rewrites Android share intents into this URL; routing it
    // as a plain page left the app on the home screen.
    it("searches for shared text delivered as an app URL", () => {
      openUrl(
        "https://biblia.capuchinhos.org/?text=amai-vos%20uns%20aos%20outros",
      )
      expect(routerSpy.navigate).toHaveBeenCalledWith(["/search"], {
        queryParams: { q: "amai-vos uns aos outros" },
      })
      expect(routerSpy.navigateByUrl).not.toHaveBeenCalled()
    })

    // Android share sheets put the link inside the text, often mid-sentence.
    it("opens a link to this site found inside shared text", () => {
      openUrl(
        `https://biblia.capuchinhos.org/?text=${encodeURIComponent(
          "Lê isto: https://biblia.capuchinhos.org/mc/7.",
        )}`,
      )
      expect(routerSpy.navigateByUrl).toHaveBeenCalledWith("/mc/7")
      expect(routerSpy.navigate).not.toHaveBeenCalled()
    })

    it("still opens plain app links on the root", () => {
      openUrl("https://biblia.capuchinhos.org/?ref=x")
      expect(routerSpy.navigateByUrl).toHaveBeenCalledWith("/?ref=x")
    })
  })
})
