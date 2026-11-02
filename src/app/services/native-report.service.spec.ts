import { TestBed } from "@angular/core/testing"
import { Subject } from "rxjs"
import type { Mock } from "vitest"
import { createSpyObj, lastCall, type SpyObj } from "../testing/spy-obj"
import { NativeChromeService } from "./native-chrome.service"
import type { NativeChromeAction } from "./native-chrome.types"
import { NativeReportService } from "./native-report.service"
import { ProblemReportService } from "./problem-report.service"
import { ToastService } from "./toast.service"

describe("NativeReportService", () => {
  let actions: Subject<NativeChromeAction>
  let nativeChrome: {
    actions$: Subject<NativeChromeAction>
  } & Record<"showReport" | "finishReport", Mock>
  let reports: {
    topics: {
      value: string
      label: string
    }[]
    send: Mock
  }
  let toast: SpyObj<ToastService>
  let service: NativeReportService

  const genesis = { id: "gen", name: "Génesis", shortName: "Génesis" } as Book
  const settle = () => new Promise((resolve) => setTimeout(resolve))

  beforeEach(() => {
    actions = new Subject()
    nativeChrome = {
      actions$: actions,
      showReport: vi.fn().mockName("showReport").mockResolvedValue(true),
      finishReport: vi.fn().mockName("finishReport"),
    }
    reports = {
      topics: [{ value: "typo", label: "Erro ortográfico" }],
      send: vi.fn().mockName("send").mockResolvedValue(undefined),
    }
    toast = createSpyObj("ToastService", ["show"])
    TestBed.configureTestingModule({
      providers: [
        { provide: NativeChromeService, useValue: nativeChrome },
        { provide: ProblemReportService, useValue: reports },
        { provide: ToastService, useValue: toast },
      ],
    })
    service = TestBed.inject(NativeReportService)
  })

  // Named as the passage button names it, in Portuguese quotation marks.
  it("opens the sheet about the chapter", () => {
    service.open(genesis, 3)

    expect(nativeChrome.showReport).toHaveBeenCalledWith({
      message: "Encontrou algum problema em «Génesis 3»? Ajude-nos a melhorar.",
      topics: reports.topics,
      placeholder: expect.any(String),
      maxLength: 500,
    })
  })

  it("names a psalm with its liturgical number, and the About page alone", () => {
    service.open({ id: "psa", name: "Salmos", shortName: "Salmos" } as Book, 34)
    expect(lastCall(vi.mocked(nativeChrome.showReport))[0].message).toContain(
      "«Salmo 34 (33)»",
    )
    service.open(
      { id: "about", name: "Sobre", shortName: "Sobre a Bíblia" } as Book,
      1,
    )
    expect(lastCall(vi.mocked(nativeChrome.showReport))[0].message).toContain(
      "«Sobre a Bíblia»",
    )
  })

  it("sends the report, closes the sheet and thanks", async () => {
    service.open(genesis, 3)
    actions.next({ id: "report-submit", topic: "typo", details: "vírgula" })
    await settle()

    expect(reports.send).toHaveBeenCalledWith({
      bookId: "gen",
      chapter: 3,
      topic: "typo",
      details: "vírgula",
    })
    expect(nativeChrome.finishReport).toHaveBeenCalledWith({ sent: true })
    expect(toast.show).toHaveBeenCalledWith(
      "O problema foi reportado. Obrigado!",
    )
  })

  it("keeps the sheet open with the error when sending fails", async () => {
    vi.spyOn(console, "error").mockReturnValue(undefined)
    reports.send.mockRejectedValue(new Error("Analytics is unavailable"))
    service.open(genesis, 3)
    actions.next({ id: "report-submit", topic: "typo", details: "vírgula" })
    await settle()

    expect(nativeChrome.finishReport).toHaveBeenCalledWith({
      sent: false,
      message: "Erro ao enviar o relatório. Tente novamente.",
    })
    expect(toast.show).not.toHaveBeenCalled()
  })

  it("stops listening once the sheet closes", async () => {
    service.open(genesis, 3)
    await settle()
    actions.next({ id: "report-closed" })
    actions.next({ id: "report-submit", topic: "typo", details: "vírgula" })
    await settle()

    expect(reports.send).not.toHaveBeenCalled()
  })

  // Asked for while the last sheet was closing: the shell presents this one
  // once that one has gone, and the last one's close came in between.
  it("keeps listening through the closing sheet's report-closed", async () => {
    let answer: (presented: boolean) => void = () => {}
    nativeChrome.showReport.mockReturnValue(
      new Promise<boolean>((resolve) => {
        answer = resolve
      }),
    )
    service.open(genesis, 3)
    actions.next({ id: "report-closed" })
    answer(true)
    await settle()
    actions.next({ id: "report-submit", topic: "typo", details: "vírgula" })
    await settle()

    expect(reports.send).toHaveBeenCalled()
  })

  // Over another sheet none comes up, and no report-closed would follow.
  it("stops listening when no sheet came up", async () => {
    nativeChrome.showReport.mockResolvedValue(false)
    service.open(genesis, 3)
    await settle()
    actions.next({ id: "report-submit", topic: "typo", details: "vírgula" })
    await settle()

    expect(reports.send).not.toHaveBeenCalled()
  })

  it("answers only for the sheet open now", async () => {
    service.open(genesis, 3)
    service.open(genesis, 4)
    actions.next({ id: "report-submit", topic: "typo", details: "vírgula" })
    await settle()

    expect(reports.send).toHaveBeenCalledTimes(1)

    expect(reports.send).toHaveBeenCalledWith(
      expect.objectContaining({ chapter: 4 }),
    )
  })
})
