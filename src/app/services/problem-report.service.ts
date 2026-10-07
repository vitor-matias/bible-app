import { Injectable, inject } from "@angular/core"
import { AnalyticsService } from "./analytics.service"

/** The longest description a report takes. */
export const PROBLEM_DETAILS_MAX_LENGTH = 500

export interface ProblemReport {
  bookId: string
  chapter: number
  topic: string
  details: string
}

/**
 * Reports a problem with a chapter, from the web dialog (ReportProblemComponent)
 * or the iOS sheet (NativeReportService). A report travels as an analytics event.
 */
@Injectable({
  providedIn: "root",
})
export class ProblemReportService {
  private readonly analytics = inject(AnalyticsService)

  readonly topics: readonly { value: string; label: string }[] = [
    { value: "typo", label: "Erro Ortográfico" },
    { value: "formatting", label: "Formatação" },
    /*{ value: "audio", label: "Áudio" },*/
    { value: "suggestion", label: "Sugestão" },
    { value: "other", label: "Outro" },
  ]

  /** Rejects when the report can't be sent. */
  async send({
    bookId,
    chapter,
    topic,
    details,
  }: ProblemReport): Promise<void> {
    if (!this.analytics.areAnalyticsAvailable()) {
      throw new Error("Analytics is unavailable")
    }
    await this.analytics.track("report_problem", {
      book: bookId,
      chapter,
      topic,
      details,
    })
  }
}
