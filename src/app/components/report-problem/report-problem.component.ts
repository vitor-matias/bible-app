import { CommonModule } from "@angular/common"
import { Component, Inject } from "@angular/core"
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
import { MatSnackBar, MatSnackBarModule } from "@angular/material/snack-bar"

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
  styleUrls: ["./report-problem.component.css"],
})
export class ReportProblemComponent {
  reportForm = new FormGroup({
    topic: new FormControl("", [Validators.required]),
    details: new FormControl("", [
      Validators.required,
      Validators.maxLength(500),
    ]),
  })

  topics = [
    { value: "typo", label: "Erro Ortográfico" },
    { value: "formatting", label: "Formatação" },
    /*{ value: "audio", label: "Áudio" },*/
    { value: "suggestion", label: "Sugestão" },
    { value: "other", label: "Outro" },
  ]

  constructor(
    public dialogRef: MatDialogRef<ReportProblemComponent>,
    @Inject(MAT_DIALOG_DATA) public data: ReportProblemData,
    private snackBar: MatSnackBar,
  ) {}

  onSubmit() {
    if (this.reportForm.valid) {
      const { topic, details } = this.reportForm.value

      if (typeof window !== "undefined" && window.umami) {
        window.umami.track("report_problem", {
          book: this.data.book.id,
          chapter: this.data.chapter,
          topic,
          details,
        })
      }

      this.snackBar.open("O problema foi reportado. Obrigado!", "Fechar", {
        duration: 3000,
      })

      this.dialogRef.close(true)
    }
  }

  onCancel() {
    this.dialogRef.close()
  }
}
