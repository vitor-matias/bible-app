import { TestBed } from "@angular/core/testing"
import { Capacitor } from "@capacitor/core"
import { SystemTextSizeService } from "./system-text-size.service"

describe("SystemTextSizeService", () => {
  let service: SystemTextSizeService

  beforeEach(() => {
    service = TestBed.inject(SystemTextSizeService)
  })

  it("follows nothing outside the iOS app", () => {
    spyOn(Capacitor, "getPlatform").and.returnValue("web")
    expect(service.percent()).toBeNull()
  })

  // Chrome has no Dynamic Type: the iOS web view would size the probe.
  it("follows nothing where the system font is unknown", () => {
    spyOn(Capacitor, "getPlatform").and.returnValue("ios")
    spyOn(CSS, "supports").and.returnValue(false)
    expect(service.percent()).toBeNull()
  })

  it("reads the system body size against iOS's default", () => {
    spyOn(Capacitor, "getPlatform").and.returnValue("ios")
    spyOn(CSS, "supports").and.returnValue(true)
    spyOn(window, "getComputedStyle").and.returnValue({
      fontSize: "21px",
    } as CSSStyleDeclaration)

    expect(service.percent()).toBeCloseTo((21 / 17) * 100, 5)
    // The probe is gone again.
    expect(document.body.querySelector("span[style*='hidden']")).toBeNull()
  })
})
