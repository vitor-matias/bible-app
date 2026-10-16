import { TestBed } from "@angular/core/testing"
import type { App } from "@capacitor/app"
import { Capacitor } from "@capacitor/core"
import { APP_PLUGIN } from "../tokens"
import { BuildVersionService } from "./build-version.service"

describe("BuildVersionService", () => {
  let appPlugin: jasmine.SpyObj<typeof App>

  const createService = () => TestBed.inject(BuildVersionService)
  const serveBuildInfo = (buildVersion: string) =>
    spyOn(window, "fetch").and.resolveTo(
      new Response(JSON.stringify({ buildVersion })),
    )

  beforeEach(() => {
    appPlugin = jasmine.createSpyObj("App", ["getInfo"])
    TestBed.configureTestingModule({
      providers: [{ provide: APP_PLUGIN, useValue: appPlugin }],
    })
  })

  describe("getDisplayVersion", () => {
    it("is the release version in the native apps", async () => {
      spyOn(Capacitor, "isNativePlatform").and.returnValue(true)
      appPlugin.getInfo.and.resolveTo({ version: "1.2.3" } as never)
      const fetch = serveBuildInfo("20261016-120000Z")

      expect(await createService().getDisplayVersion()).toBe("1.2.3")
      expect(fetch).not.toHaveBeenCalled()
    })

    it("is the build id on the web", async () => {
      spyOn(Capacitor, "isNativePlatform").and.returnValue(false)
      serveBuildInfo("20261016-120000Z")

      expect(await createService().getDisplayVersion()).toBe("20261016-120000Z")
      expect(appPlugin.getInfo).not.toHaveBeenCalled()
    })

    it("falls back to the build id if the app cannot say its version", async () => {
      spyOn(Capacitor, "isNativePlatform").and.returnValue(true)
      appPlugin.getInfo.and.rejectWith(new Error("not implemented"))
      serveBuildInfo("20261016-120000Z")

      expect(await createService().getDisplayVersion()).toBe("20261016-120000Z")
    })

    it("falls back to the build id if the app's version is blank", async () => {
      spyOn(Capacitor, "isNativePlatform").and.returnValue(true)
      appPlugin.getInfo.and.resolveTo({ version: " " } as never)
      serveBuildInfo("20261016-120000Z")

      expect(await createService().getDisplayVersion()).toBe("20261016-120000Z")
    })

    it("is dev-local when there is no build info", async () => {
      spyOn(Capacitor, "isNativePlatform").and.returnValue(false)
      spyOn(window, "fetch").and.rejectWith(new Error("offline"))

      expect(await createService().getDisplayVersion()).toBe("dev-local")
    })
  })
})
