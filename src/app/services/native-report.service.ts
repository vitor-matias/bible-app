import { Injectable, inject } from "@angular/core"
import type { Subscription } from "rxjs"
import { NativeChromeService } from "./native-chrome.service"
import {
  PROBLEM_DETAILS_MAX_LENGTH,
  ProblemReportService,
} from "./problem-report.service"
import { ToastService } from "./toast.service"

/**
 * "Reportar erro" as a native form sheet in the iOS app. The sheet collects
 * the report; this sends it as the web dialog (ReportProblemComponent) does,
 * then closes the sheet, or leaves it open with the error.
 */
@Injectable({
  providedIn: "root",
})
export class NativeReportService {
  private readonly nativeChrome = inject(NativeChromeService)
  private readonly reports = inject(ProblemReportService)
  private readonly toast = inject(ToastService)
  private session?: Subscription

  open(book: Book, chapter: number): void {
    this.session?.unsubscribe()
    const session = this.nativeChrome.actions$.subscribe((action) => {
      if (action.id === "report-closed") session.unsubscribe()
      if (action.id !== "report-submit") return
      this.reports
        .send({
          bookId: book.id,
          chapter,
          topic: action.topic,
          details: action.details,
        })
        .then(
          () => {
            this.nativeChrome.finishReport({ sent: true })
            this.toast.show("O problema foi reportado. Obrigado!")
          },
          (error: unknown) => {
            console.error("Failed to submit report:", error)
            this.nativeChrome.finishReport({
              sent: false,
              message: "Erro ao enviar o relatório. Tente novamente.",
            })
          },
        )
    })
    this.session = session
    // Over another sheet none comes up, and no report-closed would end this.
    void this.nativeChrome
      .showReport({
        message: `Encontrou algum problema em "${book.name}", capítulo ${chapter}? Ajude-nos a melhorar.`,
        topics: this.reports.topics,
        placeholder:
          "Descreva o problema (ex: falta uma vírgula após a palavra 'Deus')...",
        maxLength: PROBLEM_DETAILS_MAX_LENGTH,
      })
      .then((presented) => {
        if (!presented) session.unsubscribe()
      })
  }
}
