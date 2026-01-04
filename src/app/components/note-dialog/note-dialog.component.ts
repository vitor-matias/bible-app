import { CommonModule } from "@angular/common"
import { Component, Inject } from "@angular/core"
import { FormsModule } from "@angular/forms"
import {
  MAT_DIALOG_DATA,
  MatDialogModule,
  MatDialogRef,
} from "@angular/material/dialog"
import { MatButtonModule } from "@angular/material/button"
import { MatFormFieldModule } from "@angular/material/form-field"
import { MatInputModule } from "@angular/material/input"

@Component({
  selector: "note-dialog",
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
  ],
  templateUrl: "./note-dialog.component.html",
  styleUrl: "./note-dialog.component.css",
})
export class NoteDialogComponent {
  note = ""

  constructor(
    private readonly dialogRef: MatDialogRef<NoteDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: { text: string },
  ) {}

  close(): void {
    this.dialogRef.close()
  }

  save(): void {
    this.dialogRef.close(this.note.trim())
  }
}
