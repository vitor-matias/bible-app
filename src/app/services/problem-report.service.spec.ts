import { TestBed } from "@angular/core/testing"
import { createSpyObj, type SpyObj } from "../testing/spy-obj"
import { AnalyticsService } from "./analytics.service"
import { ProblemReportService } from "./problem-report.service"

describe("ProblemReportService", () => {
  let analytics: SpyObj<AnalyticsService>
  let service: ProblemReportService

  const report = { bookId: "gen", chapter: 1, topic: "typo", details: "x" }

  beforeEach(() => {
    analytics = createSpyObj("AnalyticsService", [
      "trackDelivered",
      "areAnalyticsAvailable",
    ])
    analytics.trackDelivered.mockResolvedValue(undefined)
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
