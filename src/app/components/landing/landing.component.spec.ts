import { TestBed } from "@angular/core/testing"
import { provideRouter, Router } from "@angular/router"
import { Capacitor } from "@capacitor/core"
import {
  type InstallPlatform,
  PwaInstallService,
} from "../../services/pwa-install.service"
import { SeoService } from "../../services/seo.service"
import { AUTO_OPEN_MS, CHOSE_KEY, LandingComponent } from "./landing.component"

describe("LandingComponent", () => {
  const seo = { updateForLanding: vi.fn() }

  beforeEach(() => sessionStorage.removeItem(CHOSE_KEY))
  afterAll(() => sessionStorage.removeItem(CHOSE_KEY))

  async function setup(platform: InstallPlatform) {
    vi.useFakeTimers()
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: SeoService, useValue: seo },
        {
          provide: PwaInstallService,
          useValue: { detectPlatform: () => platform },
        },
      ],
    })
    const navigate = vi
      .spyOn(TestBed.inject(Router), "navigateByUrl")
      .mockResolvedValue(true)
    const fixture = TestBed.createComponent(LandingComponent)
    fixture.detectChanges()
    fixture.detectChanges()
    return { el: fixture.nativeElement as HTMLElement, fixture, navigate }
  }

  it("links the website and both stores", async () => {
    const { el } = await setup("desktop")
    const hrefs = [...el.querySelectorAll("a")].map((a) =>
      a.getAttribute("href"),
    )
    expect(hrefs).toEqual(["/", "/ios", "/android"])
  })

  it("stays put on a desktop", async () => {
    const { el, navigate } = await setup("desktop")
    await vi.advanceTimersByTimeAsync(AUTO_OPEN_MS * 2)
    expect(el.querySelector(".auto, .status")).toBeNull()
    expect(navigate).not.toHaveBeenCalled()
  })

  for (const platform of ["ios", "android"] as const) {
    it(`sends ${platform} to its store once the bar fills`, async () => {
      const { el, navigate } = await setup(platform)
      expect(el.querySelector("a.auto")?.getAttribute("href")).toBe(
        `/${platform}`,
      )
      await vi.advanceTimersByTimeAsync(AUTO_OPEN_MS - 1)
      expect(navigate).not.toHaveBeenCalled()
      await vi.advanceTimersByTimeAsync(1)
      expect(navigate).toHaveBeenCalledWith(`/${platform}`)
    })
  }

  it("goes straight to the reader inside the apps", async () => {
    vi.spyOn(Capacitor, "isNativePlatform").mockReturnValue(true)
    const { el, navigate } = await setup("android")
    expect(navigate).toHaveBeenCalledWith("/", { replaceUrl: true })
    await vi.advanceTimersByTimeAsync(AUTO_OPEN_MS * 2)
    expect(navigate).toHaveBeenCalledTimes(1)
    expect(el.querySelector(".auto")).toBeNull()
  })

  it("sets its own head, for the link previews", async () => {
    seo.updateForLanding.mockClear()
    await setup("desktop")
    expect(seo.updateForLanding).toHaveBeenCalledTimes(1)
  })

  // The store routes cancel their navigation, so the page stays alive: an
  // iPhone visitor who tapped Google Play was still sent to the App Store.
  it("stops the countdown once a store link is tapped", async () => {
    const { el, navigate } = await setup("ios")
    el.querySelector<HTMLElement>('a[href="/android"]')?.click()
    navigate.mockClear()
    await vi.advanceTimersByTimeAsync(AUTO_OPEN_MS * 2)
    expect(navigate).not.toHaveBeenCalled()
  })

  // Back from the reader recreates the page: it sent the visitor to the store
  // they had just turned down.
  for (const [what, selector] of [
    ["Cancelar", "button"],
    ["Abrir no navegador", 'a[href="/"]'],
  ]) {
    it(`does not count down again after ${what}, on coming back`, async () => {
      const first = await setup("android")
      first.el.querySelector<HTMLElement>(selector)?.click()
      first.fixture.destroy()
      TestBed.resetTestingModule()

      const { el, navigate } = await setup("android")
      await vi.advanceTimersByTimeAsync(AUTO_OPEN_MS * 2)
      expect(el.querySelector(".auto, .status")).toBeNull()
      expect(navigate).not.toHaveBeenCalled()
    })
  }

  it("leaves a crawler on the page it is to index", async () => {
    vi.spyOn(navigator, "userAgent", "get").mockReturnValue(
      "Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X Build/MMB29P) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
    )
    const { el, navigate } = await setup("android")
    await vi.advanceTimersByTimeAsync(AUTO_OPEN_MS * 2)
    expect(el.querySelector(".auto, .status")).toBeNull()
    expect(navigate).not.toHaveBeenCalled()
  })

  it("does not take a phone with bot in its model name for a crawler", async () => {
    vi.spyOn(navigator, "userAgent", "get").mockReturnValue(
      "Mozilla/5.0 (Linux; Android 11; CUBOT NOTE 20 PRO; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/141.0.0.0 Mobile Safari/537.36",
    )
    const { navigate } = await setup("android")
    await vi.advanceTimersByTimeAsync(AUTO_OPEN_MS)
    expect(navigate).toHaveBeenCalledWith("/android")
  })

  it("Cancelar keeps the visitor on the page", async () => {
    const { el, fixture, navigate } = await setup("android")
    el.querySelector("button")?.click()
    fixture.detectChanges()
    await vi.advanceTimersByTimeAsync(AUTO_OPEN_MS * 2)
    expect(el.querySelector(".auto, .status")).toBeNull()
    expect(navigate).not.toHaveBeenCalled()
  })
})
