import { TestBed } from "@angular/core/testing"
import type { App } from "@capacitor/app"
import { Capacitor } from "@capacitor/core"
import { createSpyObj, type SpyObj } from "../testing/spy-obj"
import { APP_PLUGIN } from "../tokens"
import { BuildVersionService } from "./build-version.service"

describe("BuildVersionService", () => {
  let appPlugin: SpyObj<typeof App>

  const createService = () => TestBed.inject(BuildVersionService)
  const serveBuildInfo = (buildVersion: string) =>
    vi
      .spyOn(window, "fetch")
      .mockResolvedValue(new Response(JSON.stringify({ buildVersion })))

  beforeEach(() => {
    appPlugin = createSpyObj("App", ["getInfo"])
    TestBed.configureTestingModule({
      providers: [{ provide: APP_PLUGIN, useValue: appPlugin }],
    })
  })

  describe("getDisplayVersion", () => {
    it("is the release and the compile timestamp in the native apps", async () => {
      vi.spyOn(Capacitor, "isNativePlatform").mockReturnValue(true)
      appPlugin.getInfo.mockResolvedValue({ version: "1.2.3" } as never)
      serveBuildInfo("20261016-120000Z")

      expect(await createService().getDisplayVersion()).toEqual({
        release: "1.2.3",
        build: "20261016-120000Z",
      })
    })

    it("is the compile timestamp alone on the web, which has no releases", async () => {
      vi.spyOn(Capacitor, "isNativePlatform").mockReturnValue(false)
      serveBuildInfo("20261016-120000Z")

      expect(await createService().getDisplayVersion()).toEqual({
        release: null,
        build: "20261016-120000Z",
      })
      expect(appPlugin.getInfo).not.toHaveBeenCalled()
    })

    it("has no release if the app cannot say its version", async () => {
      vi.spyOn(Capacitor, "isNativePlatform").mockReturnValue(true)
      appPlugin.getInfo.mockRejectedValue(new Error("not implemented"))
      serveBuildInfo("20261016-120000Z")

      expect(await createService().getDisplayVersion()).toEqual({
        release: null,
        build: "20261016-120000Z",
      })
    })

    it("has no release if the app's version is blank", async () => {
      vi.spyOn(Capacitor, "isNativePlatform").mockReturnValue(true)
      appPlugin.getInfo.mockResolvedValue({ version: " " } as never)
      serveBuildInfo("20261016-120000Z")

      expect(await createService().getDisplayVersion()).toEqual({
        release: null,
        build: "20261016-120000Z",
      })
    })

    it("has dev-local for a timestamp when there is no build info", async () => {
      vi.spyOn(Capacitor, "isNativePlatform").mockReturnValue(true)
      appPlugin.getInfo.mockResolvedValue({ version: "1.2.3" } as never)
      vi.spyOn(window, "fetch").mockRejectedValue(new Error("offline"))

      expect(await createService().getDisplayVersion()).toEqual({
        release: "1.2.3",
        build: "dev-local",
      })
    })
  })
})
