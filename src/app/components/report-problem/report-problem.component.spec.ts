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
import { MatSnackBarModule } from "@angular/material/snack-bar"
import { BrowserAnimationsModule } from "@angular/platform-browser/animations"
import { ReportProblemComponent } from "./report-problem.component"

describe("ReportProblemComponent", () => {
  let component: ReportProblemComponent
  let fixture: ComponentFixture<ReportProblemComponent>
  let mockDialogRef: jasmine.SpyObj<MatDialogRef<ReportProblemComponent>>

  const mockDialogData = {
    bookId: "gen",
    chapter: 1,
  }

  beforeEach(async () => {
    mockDialogRef = jasmine.createSpyObj("MatDialogRef", ["close"])

    await TestBed.configureTestingModule({
      imports: [
        ReportProblemComponent,
        ReactiveFormsModule,
        MatDialogModule,
        MatFormFieldModule,
        MatInputModule,
        MatSelectModule,
        MatSnackBarModule,
        BrowserAnimationsModule,
      ],
      providers: [
        { provide: MatDialogRef, useValue: mockDialogRef },
        { provide: MAT_DIALOG_DATA, useValue: mockDialogData },
      ],
    }).compileComponents()

    fixture = TestBed.createComponent(ReportProblemComponent)
    component = fixture.componentInstance
    fixture.detectChanges()

    // Reset umami mock on window
    ;(window as any).umami = { track: jasmine.createSpy("track") }
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

    expect((window as any).umami.track).not.toHaveBeenCalled()
    expect(mockDialogRef.close).not.toHaveBeenCalled()
  })

  it("should track event and close dialog if form is valid on submit", () => {
    component.reportForm.get("topic")?.setValue("formatting")
    component.reportForm.get("details")?.setValue("bold text missing")
    component.onSubmit()

    expect((window as any).umami.track).toHaveBeenCalledWith("report_problem", {
      book: "gen",
      chapter: 1,
      topic: "formatting",
      details: "bold text missing",
    })
    expect(mockDialogRef.close).toHaveBeenCalledWith(true)
  })
})
