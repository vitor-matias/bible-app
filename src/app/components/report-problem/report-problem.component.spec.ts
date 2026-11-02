import { ComponentFixture, TestBed } from "@angular/core/testing"
import { ReactiveFormsModule } from "@angular/forms"
import {
  MAT_DIALOG_DATA,
  MatDialogModule,
  MatDialogRef,
} from "@angular/material/dialog"
import { MatFormFieldModule } from "@angular/material/form-field"
import { MatInputModule } from "@angular/material/input"
import { MatSelectModule } from "@angular/material/select"
import { MatSnackBar } from "@angular/material/snack-bar"
import { BrowserAnimationsModule } from "@angular/platform-browser/animations"
import { AnalyticsService } from "../../services/analytics.service"
import { ProblemReportService } from "../../services/problem-report.service"
import { ToastService } from "../../services/toast.service"
import { createSpyObj, type SpyObj } from "../../testing/spy-obj"
import { ReportProblemComponent } from "./report-problem.component"

describe("ReportProblemComponent", () => {
  beforeEach(() => {
    vi.useFakeTimers({ advanceTimeDelta: 1, shouldAdvanceTime: true })
  })
  afterEach(() => {
    vi.useRealTimers()
  })
  let component: ReportProblemComponent
  let fixture: ComponentFixture<ReportProblemComponent>
  let mockDialogRef: SpyObj<MatDialogRef<ReportProblemComponent>>
  let snackBarSpy: SpyObj<MatSnackBar>
  let analyticsServiceSpy: SpyObj<AnalyticsService>

  const mockDialogData = {
    book: { id: "gen", name: "Gênesis", shortName: "Génesis" },
    chapter: 1,
  }

  beforeEach(async () => {
    mockDialogRef = createSpyObj("MatDialogRef", ["close"])
    snackBarSpy = createSpyObj("MatSnackBar", ["open"])
    analyticsServiceSpy = createSpyObj("AnalyticsService", [
      "trackDelivered",
      "areAnalyticsAvailable",
    ])
    analyticsServiceSpy.trackDelivered.mockResolvedValue(undefined)
    analyticsServiceSpy.areAnalyticsAvailable.mockReturnValue(true)

    await TestBed.configureTestingModule({
      imports: [
        ReportProblemComponent,
        ReactiveFormsModule,
        MatDialogModule,
        MatFormFieldModule,
        MatInputModule,
        MatSelectModule,
        BrowserAnimationsModule,
      ],
    })
      .overrideComponent(ReportProblemComponent, {
        add: {
          providers: [
            { provide: MatDialogRef, useValue: mockDialogRef },
            { provide: MAT_DIALOG_DATA, useValue: mockDialogData },
            { provide: MatSnackBar, useValue: snackBarSpy },
            // Root-provided, these would reach the real MatSnackBar and
            // AnalyticsService, not these spies.
            ToastService,
            ProblemReportService,
            { provide: AnalyticsService, useValue: analyticsServiceSpy },
          ],
        },
      })
      .compileComponents()

    fixture = TestBed.createComponent(ReportProblemComponent)
    component = fixture.componentInstance
    fixture.detectChanges()
  })

  afterEach(() => {
    delete (
      window as {
        umami?: unknown
      }
    ).umami
  })

  it("should create", () => {
    expect(component).toBeTruthy()
  })

  it("names the passage as the reader does", () => {
    const description = fixture.nativeElement.querySelector(
      ".description",
    ) as HTMLElement
    expect(description.textContent).toContain("«Génesis 1»")
  })

  it("should initialize form with empty values", () => {
    expect(component.reportForm.get("topic")?.value).toBe("")
    expect(component.reportForm.get("details")?.value).toBe("")
    expect(component.reportForm.valid).toBe(false)
  })

  it("should require topic and details", () => {
    component.reportForm.get("topic")?.setValue("")
    component.reportForm.get("details")?.setValue("")
    expect(component.reportForm.valid).toBe(false)

    component.reportForm.get("topic")?.setValue("typo")
    component.reportForm.get("details")?.setValue("test missing word")
    expect(component.reportForm.valid).toBe(true)
  })

  it("should enforce max length on details", () => {
    const longString = "a".repeat(501)
    component.reportForm.get("topic")?.setValue("typo")
    component.reportForm.get("details")?.setValue(longString)

    expect(component.reportForm.valid).toBe(false)
    expect(component.reportForm.get("details")?.hasError("maxlength")).toBe(
      true,
    )
  })

  it("should call dialogRef.close() onCancel", () => {
    component.onCancel()
    expect(mockDialogRef.close).toHaveBeenCalled()
  })

  it("should not track event if form is invalid on submit", () => {
    component.reportForm.get("topic")?.setValue("")
    component.onSubmit()

    expect(analyticsServiceSpy.trackDelivered).not.toHaveBeenCalled()
    expect(mockDialogRef.close).not.toHaveBeenCalled()
    expect(snackBarSpy.open).not.toHaveBeenCalled()
  })

  it("should track event and close dialog if form is valid on submit", async () => {
    component.reportForm.get("topic")?.setValue("formatting")
    component.reportForm.get("details")?.setValue("bold text missing")
    const submitPromise = component.onSubmit()

    await vi.advanceTimersByTimeAsync(600)
    await vi.runAllTimersAsync()

    expect(analyticsServiceSpy.trackDelivered).toHaveBeenCalledWith(
      "report_problem",
      {
        book: "gen",
        chapter: 1,
        topic: "formatting",
        details: "bold text missing",
      },
    )
    expect(snackBarSpy.open).toHaveBeenCalledWith(
      "O problema foi reportado. Obrigado!",
      "Fechar",
      { duration: 3000 },
    )
    expect(mockDialogRef.close).toHaveBeenCalledWith(true)

    void submitPromise
  })

  it("should show an error snackbar and keep the dialog open when analytics transport is unavailable", async () => {
    component.reportForm.get("topic")?.setValue("other")
    component.reportForm.get("details")?.setValue("missing analytics script")
    window.umami = undefined
    analyticsServiceSpy.trackDelivered.mockRejectedValue(
      new Error("Analytics transport unavailable"),
    )

    vi.spyOn(console, "error").mockReturnValue(undefined)

    const submitPromise = component.onSubmit()
    await vi.advanceTimersByTimeAsync(600)
    await vi.runAllTimersAsync()

    expect(snackBarSpy.open).toHaveBeenCalledWith(
      "Erro ao enviar o relatório. Tente novamente.",
      "Fechar",
      { duration: 4000 },
    )
    expect(mockDialogRef.close).not.toHaveBeenCalled()

    void submitPromise
  })

  it("should show an error snackbar when tracking throws", async () => {
    component.reportForm.get("topic")?.setValue("typo")
    component.reportForm.get("details")?.setValue("tracking failure")

    const trackingError = new Error("tracking failed")
    analyticsServiceSpy.trackDelivered.mockImplementation(() => {
      throw new Error(trackingError.message)
    })

    const consoleSpy = vi.spyOn(console, "error").mockReturnValue(undefined)

    const submitPromise = component.onSubmit()
    await vi.advanceTimersByTimeAsync(600)
    await vi.runAllTimersAsync()

    expect(consoleSpy).toHaveBeenCalled()
    expect(snackBarSpy.open).toHaveBeenCalledWith(
      "Erro ao enviar o relatório. Tente novamente.",
      "Fechar",
      { duration: 4000 },
    )
    expect(mockDialogRef.close).not.toHaveBeenCalled()

    void submitPromise
  })
})
