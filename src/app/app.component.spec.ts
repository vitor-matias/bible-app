import { NgZone } from "@angular/core"
import { TestBed } from "@angular/core/testing"
import { Router } from "@angular/router"
import type { URLOpenListenerEvent } from "@capacitor/app"
import { Capacitor, type PluginListenerHandle } from "@capacitor/core"
import { AppComponent } from "./app.component"
import { OfflineDataService } from "./services/offline-data.service"
import { APP_PLUGIN } from "./tokens"

describe("AppComponent", () => {
  let routerSpy: jasmine.SpyObj<Router>
  let ngZone: NgZone
  // biome-ignore lint/suspicious/noExplicitAny: Mocking Capacitor plugin
  let mockAppPlugin: jasmine.SpyObj<any>

  beforeEach(async () => {
    routerSpy = jasmine.createSpyObj("Router", ["navigateByUrl"])
    mockAppPlugin = jasmine.createSpyObj("App", ["addListener"])

    const offlineDataSpy = jasmine.createSpyObj("OfflineDataService", [
      "preloadAllBooksAndChapters",
    ])

    await TestBed.configureTestingModule({
      imports: [AppComponent],
      providers: [
        { provide: Router, useValue: routerSpy },
        { provide: OfflineDataService, useValue: offlineDataSpy },
        { provide: APP_PLUGIN, useValue: mockAppPlugin },
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

    const mockEvent: URLOpenListenerEvent = {
      url: "https://other-domain.dev/book/gn/1",
    }

    ngZone.run(() => {
      capturedCallback(mockEvent)
    })

    expect(routerSpy.navigateByUrl).not.toHaveBeenCalled()
  })
})
