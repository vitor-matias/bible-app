import { CommonModule } from "@angular/common"
import {
  ChangeDetectionStrategy,
  Component,
  Inject,
  inject,
} from "@angular/core"
import {
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from "@angular/forms"
import { MatButtonModule } from "@angular/material/button"
import {
  MAT_DIALOG_DATA,
  MatDialogModule,
  MatDialogRef,
} from "@angular/material/dialog"
import { MatFormFieldModule } from "@angular/material/form-field"
import { MatInputModule } from "@angular/material/input"
import { MatSelectModule } from "@angular/material/select"
import { MatSnackBarModule } from "@angular/material/snack-bar"
import {
  PROBLEM_DETAILS_MAX_LENGTH,
  ProblemReportService,
} from "../../services/problem-report.service"
import { ToastService } from "../../services/toast.service"

export interface ReportProblemData {
  book: Book
  chapter: number
}

@Component({
  selector: "app-report-problem",
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatSnackBarModule,
  ],
  templateUrl: "./report-problem.component.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrls: ["./report-problem.component.css"],
})
export class ReportProblemComponent {
  private readonly toast = inject(ToastService)
  private readonly reports = inject(ProblemReportService)
  isSending = false

  reportForm = new FormGroup({
    topic: new FormControl("", [Validators.required]),
    details: new FormControl("", [
      Validators.required,
      Validators.maxLength(PROBLEM_DETAILS_MAX_LENGTH),
    ]),
  })

  topics = this.reports.topics

  constructor(
    public dialogRef: MatDialogRef<ReportProblemComponent>,
    @Inject(MAT_DIALOG_DATA) public data: ReportProblemData,
  ) {}

  async onSubmit() {
    if (this.isSending || this.reportForm.invalid) {
      return
    }

    this.isSending = true

    try {
      const { topic, details } = this.reportForm.value
      await this.reports.send({
        bookId: this.data.book.id,
        chapter: this.data.chapter,
        topic: topic ?? "",
        details: details ?? "",
      })

      this.toast.show("O problema foi reportado. Obrigado!")

      this.dialogRef.close(true)
    } catch (error) {
      console.error("Failed to submit report:", error)
      this.toast.show("Erro ao enviar o relatório. Tente novamente.", {
        duration: 4000,
      })
    } finally {
      this.isSending = false
    }
  }

  onCancel() {
    this.dialogRef.close()
  }
}
