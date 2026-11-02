import { DOCUMENT } from "@angular/common"
import { TestBed } from "@angular/core/testing"
import { NavigationEnd, Router } from "@angular/router"
import { Capacitor, SystemBarsStyle, SystemBarType } from "@capacitor/core"
import { Subject } from "rxjs"
import type { Mock } from "vitest"
import { SPLASH_SCREEN_PLUGIN, SYSTEM_BARS_PLUGIN } from "../tokens"
import { NativeShellService, SPLASH_MAX_MS } from "./native-shell.service"

describe("NativeShellService", () => {
  // Before the beforeEach below, which stubs requestAnimationFrame: installing
  // the fake clock afterwards would replace that stub.
  beforeEach(() => {
    vi.useFakeTimers()
  })

  let events: Subject<unknown>
  let splash: {
    hide: Mock
  }
  let systemBars: {
    setStyle: Mock
  }
  let body: HTMLElement

  beforeEach(() => {
    events = new Subject()
    splash = { hide: vi.fn().mockName("hide").mockResolvedValue(undefined) }
    systemBars = {
      setStyle: vi.fn().mockName("setStyle").mockResolvedValue(undefined),
    }
    body = document.createElement("body")
    TestBed.configureTestingModule({
      providers: [
        { provide: Router, useValue: { events } },
        { provide: SPLASH_SCREEN_PLUGIN, useValue: splash },
        { provide: SYSTEM_BARS_PLUGIN, useValue: systemBars },
        { provide: DOCUMENT, useValue: { body } },
      ],
    })
    // The fake clock would not run requestAnimationFrame callbacks until advanced; run them inline.
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      callback(0)
      return 0
    })
  })

  function init(platform: "android" | "ios" | "web"): void {
    vi.spyOn(Capacitor, "isNativePlatform").mockReturnValue(platform !== "web")
    vi.spyOn(Capacitor, "getPlatform").mockReturnValue(platform)
    TestBed.inject(NativeShellService).init()
  }

  // At 200% system font, Android's WebView draws a 100px font at 200px but
  // keeps a box 1em tall at 100px: their ratio is the system's text zoom.
  it("notes the system's text zoom on the root, for the stylesheet", async () => {
    const root = document.createElement("html")
    const page = document.createElement("div")
    document.body.appendChild(page)
    TestBed.overrideProvider(DOCUMENT, {
      useValue: {
        body: page,
        documentElement: root,
        defaultView: window,
        createElement: document.createElement.bind(document),
      },
    })
    const computed = window.getComputedStyle.bind(window)
    vi.spyOn(window, "getComputedStyle").mockImplementation(
      (element: Element) =>
        (element as HTMLElement).style.height === "1em"
          ? ({ fontSize: "200px" } as CSSStyleDeclaration)
          : computed(element),
    )

    init("android")

    expect(root.style.getPropertyValue("--text-zoom")).toBe("2")
    // The probe is gone.
    expect(page.children.length).toBe(0)
    await vi.advanceTimersByTimeAsync(SPLASH_MAX_MS)
    page.remove()
  })

  it("tags the body with the native platform", async () => {
    init("ios")
    expect(body.classList).toContain("native-app")
    expect(body.classList).toContain("platform-ios")
    await vi.advanceTimersByTimeAsync(SPLASH_MAX_MS)
  })

  it("hides the splash once, after the first navigation", async () => {
    init("android")
    expect(splash.hide).not.toHaveBeenCalled()

    events.next(new NavigationEnd(1, "/", "/"))
    events.next(new NavigationEnd(2, "/gn/1", "/gn/1"))
    await vi.advanceTimersByTimeAsync(SPLASH_MAX_MS)

    expect(splash.hide).toHaveBeenCalledTimes(1)
  })

  it("hides the splash anyway if no navigation completes", async () => {
    init("android")
    await vi.advanceTimersByTimeAsync(SPLASH_MAX_MS - 1)
    expect(splash.hide).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(splash.hide).toHaveBeenCalledTimes(1)
  })

  it("retries from the timeout if the first hide fails", async () => {
    splash.hide
      .mockReturnValueOnce(Promise.reject(new Error("not ready")))
      .mockReturnValueOnce(Promise.resolve())
    init("android")

    events.next(new NavigationEnd(1, "/", "/"))
    await vi.advanceTimersByTimeAsync(SPLASH_MAX_MS)

    expect(splash.hide).toHaveBeenCalledTimes(2)
  })

  it("does nothing on the web", async () => {
    init("web")
    events.next(new NavigationEnd(1, "/", "/"))
    await vi.advanceTimersByTimeAsync(SPLASH_MAX_MS)
    expect(body.classList.length).toBe(0)
    expect(splash.hide).not.toHaveBeenCalled()
  })

  // The toolbar is always brown: left to SystemBars' default, a light-mode
  // phone drew dark icons on it.
  it("styles the status bar icons light", async () => {
    init("android")
    expect(systemBars.setStyle).toHaveBeenCalledTimes(1)
    expect(systemBars.setStyle).toHaveBeenCalledWith({
      bar: SystemBarType.StatusBar,
      style: SystemBarsStyle.Dark,
    })
    await vi.advanceTimersByTimeAsync(SPLASH_MAX_MS)
  })

  it("leaves the system bars alone on the web", async () => {
    init("web")
    TestBed.inject(NativeShellService).setNavigationBarTheme(true)
    expect(systemBars.setStyle).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(SPLASH_MAX_MS)
  })

  describe("on Android", () => {
    let shell: NativeShellService

    beforeEach(() => {
      vi.spyOn(Capacitor, "isNativePlatform").mockReturnValue(true)
      vi.spyOn(Capacitor, "getPlatform").mockReturnValue("android")
      // The real document, so the shell can measure the safe area.
      TestBed.overrideProvider(DOCUMENT, { useValue: document })
      shell = TestBed.inject(NativeShellService)
    })

    afterEach(() => {
      document.documentElement.style.removeProperty("--app-inset-top")
    })

    // The navigation bar draws over the page, so it follows the in-app
    // theme, not the device theme.
    it("styles the navigation bar for the in-app theme", () => {
      document.documentElement.style.setProperty("--app-inset-top", "24px")

      shell.setNavigationBarTheme(true)
      expect(systemBars.setStyle).toHaveBeenCalledWith({
        bar: SystemBarType.NavigationBar,
        style: SystemBarsStyle.Dark,
      })

      shell.setNavigationBarTheme(false)
      expect(systemBars.setStyle).toHaveBeenCalledWith({
        bar: SystemBarType.NavigationBar,
        style: SystemBarsStyle.Light,
      })
    })

    // Older WebViews (Android 8, 9) report no safe area: the page stops at
    // the bars, which show MainActivity's brown window background instead.
    it("keeps the navigation bar icons light where the page stops at the bars", () => {
      const children = document.body.childElementCount

      shell.setNavigationBarTheme(false)

      expect(systemBars.setStyle).toHaveBeenCalledTimes(1)

      expect(systemBars.setStyle).toHaveBeenCalledWith({
        bar: SystemBarType.NavigationBar,
        style: SystemBarsStyle.Dark,
      })
      expect(document.body.childElementCount).toBe(children)
    })
  })

  it("does not surface a failed system bar call", async () => {
    vi.spyOn(Capacitor, "isNativePlatform").mockReturnValue(true)
    systemBars.setStyle.mockRejectedValue(new Error("unavailable"))
    expect(() =>
      TestBed.inject(NativeShellService).setNavigationBarTheme(true),
    ).not.toThrow()
    await Promise.resolve()
  })
})
