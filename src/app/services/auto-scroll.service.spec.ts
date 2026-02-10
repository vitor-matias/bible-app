import { TestBed } from "@angular/core/testing"
import { AutoScrollService } from "./auto-scroll.service"
import { KeepAwakeService } from "./keep-awake.service"

describe("AutoScrollService", () => {
  let service: AutoScrollService

  beforeEach(() => {
    const mockKeepAwakeService = {
      start: jasmine.createSpy("start"),
      stop: jasmine.createSpy("stop"),
    }

    TestBed.configureTestingModule({
      providers: [{ provide: KeepAwakeService, useValue: mockKeepAwakeService }],
    })
    service = TestBed.inject(AutoScrollService)
  })

  it("should be created", () => {
    expect(service).toBeTruthy()
  })

  describe("getAutoScrollSpeedLabel", () => {
    it("should return label for 1/6", () => {
      expect(service.getAutoScrollSpeedLabel(1 / 6)).toBe("1/6")
    })

    it("should return label for 1/5", () => {
      expect(service.getAutoScrollSpeedLabel(1 / 5)).toBe("1/5")
    })

    it("should return label for 1/4", () => {
      expect(service.getAutoScrollSpeedLabel(1 / 4)).toBe("1/4")
    })

    it("should return label for 1/3", () => {
      expect(service.getAutoScrollSpeedLabel(1 / 3)).toBe("1/3")
    })

    it("should return label for 1/2", () => {
      expect(service.getAutoScrollSpeedLabel(1 / 2)).toBe("1/2")
    })

    it("should return label for 2/3", () => {
      expect(service.getAutoScrollSpeedLabel(2 / 3)).toBe("2/3")
    })

    it("should return label for 3/4", () => {
      expect(service.getAutoScrollSpeedLabel(3 / 4)).toBe("3/4")
    })

    it("should return label for 4/5", () => {
      expect(service.getAutoScrollSpeedLabel(4 / 5)).toBe("4/5")
    })

    it("should return numeric label for 1", () => {
      expect(service.getAutoScrollSpeedLabel(1)).toBe("1")
    })

    it("should return numeric label for values above 1", () => {
      expect(service.getAutoScrollSpeedLabel(1.5)).toBe("1.5")
    })
  })

  describe("updateAutoScrollSpeed", () => {
    it("should increase speed from 3/4 to 4/5", () => {
      service.setAutoScrollLinesPerSecond(3 / 4)
      const newSpeed = service.updateAutoScrollSpeed(1)
      expect(newSpeed).toBeCloseTo(4 / 5, 3)
    })

    it("should increase speed from 4/5 to 1", () => {
      service.setAutoScrollLinesPerSecond(4 / 5)
      const newSpeed = service.updateAutoScrollSpeed(1)
      expect(newSpeed).toBe(1)
    })

    it("should decrease speed from 1 to 4/5", () => {
      service.setAutoScrollLinesPerSecond(1)
      const newSpeed = service.updateAutoScrollSpeed(-1)
      expect(newSpeed).toBeCloseTo(4 / 5, 3)
    })

    it("should decrease speed from 4/5 to 3/4", () => {
      service.setAutoScrollLinesPerSecond(4 / 5)
      const newSpeed = service.updateAutoScrollSpeed(-1)
      expect(newSpeed).toBeCloseTo(3 / 4, 3)
    })
  })
})
