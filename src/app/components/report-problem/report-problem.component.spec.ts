import {
  ComponentFixture,
  fakeAsync,
  flush,
  TestBed,
  tick,
} from "@angular/core/testing"
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
import { ReportProblemComponent } from "./report-problem.component"

describe("ReportProblemComponent", () => {
  let component: ReportProblemComponent
  let fixture: ComponentFixture<ReportProblemComponent>
  let mockDialogRef: jasmine.SpyObj<MatDialogRef<ReportProblemComponent>>
  let snackBarSpy: jasmine.SpyObj<MatSnackBar>
  let analyticsServiceSpy: jasmine.SpyObj<AnalyticsService>

  const mockDialogData = { book: { id: "gen", name: "Gênesis" }, chapter: 1 }

  beforeEach(async () => {
    mockDialogRef = jasmine.createSpyObj("MatDialogRef", ["close"])
    snackBarSpy = jasmine.createSpyObj("MatSnackBar", ["open"])
    analyticsServiceSpy = jasmine.createSpyObj("AnalyticsService", ["track"])
    analyticsServiceSpy.track.and.returnValue(Promise.resolve())

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
    delete (window as { umami?: unknown }).umami
  })

  it("should create", () => {
    expect(component).toBeTruthy()
  })

  it("should initialize form with empty values", () => {
    expect(component.reportForm.get("topic")?.value).toBe("")
    expect(component.reportForm.get("details")?.value).toBe("")
    expect(component.reportForm.valid).toBeFalse()
  })

  it("should require topic and details", () => {
    component.reportForm.get("topic")?.setValue("")
    component.reportForm.get("details")?.setValue("")
    expect(component.reportForm.valid).toBeFalse()

    component.reportForm.get("topic")?.setValue("typo")
    component.reportForm.get("details")?.setValue("test missing word")
    expect(component.reportForm.valid).toBeTrue()
  })

  it("should enforce max length on details", () => {
    const longString = "a".repeat(501)
    component.reportForm.get("topic")?.setValue("typo")
    component.reportForm.get("details")?.setValue(longString)

    expect(component.reportForm.valid).toBeFalse()
    expect(
      component.reportForm.get("details")?.hasError("maxlength"),
    ).toBeTrue()
  })

  it("should call dialogRef.close() onCancel", () => {
    component.onCancel()
    expect(mockDialogRef.close).toHaveBeenCalled()
  })

  it("should not track event if form is invalid on submit", () => {
    component.reportForm.get("topic")?.setValue("")
    component.onSubmit()

    expect(analyticsServiceSpy.track).not.toHaveBeenCalled()
    expect(mockDialogRef.close).not.toHaveBeenCalled()
    expect(snackBarSpy.open).not.toHaveBeenCalled()
  })

  it("should track event and close dialog if form is valid on submit", fakeAsync(() => {
    component.reportForm.get("topic")?.setValue("formatting")
    component.reportForm.get("details")?.setValue("bold text missing")
    const submitPromise = component.onSubmit()

    tick(600)
    flush()

    expect(analyticsServiceSpy.track).toHaveBeenCalledWith("report_problem", {
      book: "gen",
      chapter: 1,
      topic: "formatting",
      details: "bold text missing",
    })
    expect(snackBarSpy.open).toHaveBeenCalledWith(
      "O problema foi reportado. Obrigado!",
      "Fechar",
      { duration: 3000 },
    )
    expect(mockDialogRef.close).toHaveBeenCalledWith(true)

    void submitPromise
  }))

  it("should show an error snackbar and keep the dialog open when analytics transport is unavailable", fakeAsync(() => {
    component.reportForm.get("topic")?.setValue("other")
    component.reportForm.get("details")?.setValue("missing analytics script")
    window.umami = undefined
    analyticsServiceSpy.track.and.rejectWith(
      new Error("Analytics transport unavailable"),
    )

    spyOn(console, "error")

    const submitPromise = component.onSubmit()
    tick(600)
    flush()

    expect(snackBarSpy.open).toHaveBeenCalledWith(
      "Erro ao enviar o relatório. Tente novamente.",
      "Fechar",
      { duration: 4000 },
    )
    expect(mockDialogRef.close).not.toHaveBeenCalled()

    void submitPromise
  }))

  it("should show an error snackbar when tracking throws", fakeAsync(() => {
    component.reportForm.get("topic")?.setValue("typo")
    component.reportForm.get("details")?.setValue("tracking failure")

    const trackingError = new Error("tracking failed")
    analyticsServiceSpy.track.and.throwError(trackingError.message)

    const consoleSpy = spyOn(console, "error")

    const submitPromise = component.onSubmit()
    tick(600)
    flush()

    expect(consoleSpy).toHaveBeenCalled()
    expect(snackBarSpy.open).toHaveBeenCalledWith(
      "Erro ao enviar o relatório. Tente novamente.",
      "Fechar",
      { duration: 4000 },
    )
    expect(mockDialogRef.close).not.toHaveBeenCalled()

    void submitPromise
  }))
})
