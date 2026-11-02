import { TestBed } from "@angular/core/testing"
import type { MockedObject } from "vitest"
import { AnalyticsService } from "./analytics.service"
import { ProblemReportService } from "./problem-report.service"

describe("ProblemReportService", () => {
  let analytics: MockedObject<AnalyticsService>
  let service: ProblemReportService

  const report = { bookId: "gen", chapter: 1, topic: "typo", details: "x" }

  beforeEach(() => {
    analytics = {
      trackDelivered: vi.fn().mockName("AnalyticsService.trackDelivered"),
      areAnalyticsAvailable: vi
        .fn()
        .mockName("AnalyticsService.areAnalyticsAvailable"),
    }
    analytics.trackDelivered.mockResolvedValue()
    TestBed.configureTestingModule({
      providers: [{ provide: AnalyticsService, useValue: analytics }],
    })
    service = TestBed.inject(ProblemReportService)
  })

  it("sends the report as an analytics event", async () => {
    analytics.areAnalyticsAvailable.mockReturnValue(true)
    await service.send(report)

    expect(analytics.trackDelivered).toHaveBeenCalledWith("report_problem", {
      book: "gen",
      chapter: 1,
      topic: "typo",
      details: "x",
    })
  })

  it("fails when the report isn't delivered", async () => {
    analytics.areAnalyticsAvailable.mockReturnValue(true)
    analytics.trackDelivered.mockRejectedValue(
      new Error("Analytics responded 500"),
    )

    await expect(service.send(report)).rejects.toThrow()
  })

  it("fails when analytics can't carry it", async () => {
    analytics.areAnalyticsAvailable.mockReturnValue(false)

    await expect(service.send(report)).rejects.toThrow()
    expect(analytics.trackDelivered).not.toHaveBeenCalled()
  })
})
