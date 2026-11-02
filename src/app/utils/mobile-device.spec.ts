import type {
  InstallPlatform,
  PwaInstallService,
} from "../services/pwa-install.service"
import { isMobileDevice } from "./mobile-device"

describe("isMobileDevice", () => {
  const on = (platform: InstallPlatform) =>
    ({ detectPlatform: () => platform }) as PwaInstallService

  it("counts Android and iOS as mobile", () => {
    expect(isMobileDevice(on("android"))).toBe(true)
    expect(isMobileDevice(on("ios"))).toBe(true)
  })

  it("does not count a desktop", () => {
    expect(isMobileDevice(on("desktop"))).toBe(false)
  })
})
