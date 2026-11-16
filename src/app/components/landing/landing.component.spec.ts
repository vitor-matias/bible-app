import { TestBed } from "@angular/core/testing"
import { provideRouter, Router } from "@angular/router"
import { Capacitor } from "@capacitor/core"
import {
  type InstallPlatform,
  PwaInstallService,
} from "../../services/pwa-install.service"
import { AUTO_OPEN_MS, LandingComponent } from "./landing.component"

describe("LandingComponent", () => {
  async function setup(platform: InstallPlatform) {
    vi.useFakeTimers()
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
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

  it("Cancelar keeps the visitor on the page", async () => {
    const { el, fixture, navigate } = await setup("android")
    el.querySelector("button")?.click()
    fixture.detectChanges()
    await vi.advanceTimersByTimeAsync(AUTO_OPEN_MS * 2)
    expect(el.querySelector(".auto, .status")).toBeNull()
    expect(navigate).not.toHaveBeenCalled()
  })
})
