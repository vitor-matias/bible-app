import { TestBed } from "@angular/core/testing"
import { Capacitor } from "@capacitor/core"
import { ImpactStyle, NotificationType } from "@capacitor/haptics"
import { HAPTICS_PLUGIN } from "../tokens"
import { HapticsService } from "./haptics.service"

describe("HapticsService", () => {
  let plugin: { impact: jasmine.Spy; notification: jasmine.Spy }
  let service: HapticsService

  beforeEach(() => {
    plugin = {
      impact: jasmine.createSpy("impact").and.resolveTo(),
      notification: jasmine.createSpy("notification").and.resolveTo(),
    }
    TestBed.configureTestingModule({
      providers: [{ provide: HAPTICS_PLUGIN, useValue: plugin }],
    })
    service = TestBed.inject(HapticsService)
  })

  describe("on native platforms", () => {
    beforeEach(() => {
      spyOn(Capacitor, "isNativePlatform").and.returnValue(true)
    })

    it("plays a light impact", () => {
      service.light()
      expect(plugin.impact).toHaveBeenCalledWith({ style: ImpactStyle.Light })
    })

    it("plays a success notification", () => {
      service.success()
      expect(plugin.notification).toHaveBeenCalledWith({
        type: NotificationType.Success,
      })
    })

    it("swallows plugin failures on devices without haptics", async () => {
      plugin.impact.and.rejectWith(new Error("unavailable"))
      expect(() => service.light()).not.toThrow()
      // Let the rejection settle; an unhandled one would fail the run.
      await Promise.resolve()
    })
  })

  it("does nothing on the web", () => {
    spyOn(Capacitor, "isNativePlatform").and.returnValue(false)
    service.light()
    service.success()
    expect(plugin.impact).not.toHaveBeenCalled()
    expect(plugin.notification).not.toHaveBeenCalled()
  })
})
