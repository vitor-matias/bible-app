import { ChangeDetectionStrategy, Component } from "@angular/core"
import { MatButtonModule } from "@angular/material/button"
import { MatDialogModule } from "@angular/material/dialog"
import { STUDY_SHORTCUTS } from "./study-shortcuts"

/** The list of study mode's keys, opened with "?" or from the menu. */
@Component({
  selector: "study-shortcuts",
  standalone: true,
  imports: [MatDialogModule, MatButtonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h2 mat-dialog-title>Atalhos de teclado</h2>
    <mat-dialog-content>
      <dl class="shortcuts">
        @for (shortcut of shortcuts; track shortcut.does) {
        <div class="shortcut">
          <dt>
            @for (key of shortcut.shown ?? shortcut.keys; track key) {
            <kbd>{{ key }}</kbd>
            }
          </dt>
          <dd>{{ shortcut.does }}</dd>
        </div>
        }
      </dl>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>Fechar</button>
    </mat-dialog-actions>
  `,
  styles: `
    /* Said outright: left to Material, a dialog's body is its "supporting
       text" colour, which in the dark theme is too dim to read a list by. */
    .shortcuts {
      color: var(--text-color);
      margin: 0;
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 10px 28px;
    }

    .shortcut {
      display: flex;
      align-items: baseline;
      gap: 12px;
    }

    dt {
      flex: 0 0 56px;
      display: flex;
      gap: 4px;
    }

    dd {
      margin: 0;
      font-size: 14px;
    }

    kbd {
      min-width: 22px;
      padding: 2px 6px;
      border: 1px solid var(--study-muted);
      border-bottom-width: 2px;
      border-radius: 6px;
      font: 600 12px/1.4 Roboto, "Helvetica Neue", sans-serif;
      text-align: center;
    }
  `,
})
export class StudyShortcutsComponent {
  readonly shortcuts = STUDY_SHORTCUTS
}
