import { TestBed } from "@angular/core/testing"
import { AnalyticsService } from "./analytics.service"
import { ProblemReportService } from "./problem-report.service"

describe("ProblemReportService", () => {
  let analytics: jasmine.SpyObj<AnalyticsService>
  let service: ProblemReportService

  const report = { bookId: "gen", chapter: 1, topic: "typo", details: "x" }

  beforeEach(() => {
    analytics = jasmine.createSpyObj("AnalyticsService", [
      "trackDelivered",
      "areAnalyticsAvailable",
    ])
    analytics.trackDelivered.and.resolveTo()
    TestBed.configureTestingModule({
      providers: [{ provide: AnalyticsService, useValue: analytics }],
    })
    service = TestBed.inject(ProblemReportService)
  })

  it("sends the report as an analytics event", async () => {
    analytics.areAnalyticsAvailable.and.returnValue(true)
    await service.send(report)

    expect(analytics.trackDelivered).toHaveBeenCalledWith("report_problem", {
      book: "gen",
      chapter: 1,
      topic: "typo",
      details: "x",
    })
  })

  it("fails when the report isn't delivered", async () => {
    analytics.areAnalyticsAvailable.and.returnValue(true)
    analytics.trackDelivered.and.rejectWith(
      new Error("Analytics responded 500"),
    )

    await expectAsync(service.send(report)).toBeRejected()
  })

  it("fails when analytics can't carry it", async () => {
    analytics.areAnalyticsAvailable.and.returnValue(false)

    await expectAsync(service.send(report)).toBeRejected()
    expect(analytics.trackDelivered).not.toHaveBeenCalled()
  })
})
