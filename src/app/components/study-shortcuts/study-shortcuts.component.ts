import { ChangeDetectionStrategy, Component, inject } from "@angular/core"
import { MatButtonModule } from "@angular/material/button"
import { MatDialogModule } from "@angular/material/dialog"
import { StudyModeService } from "../../services/study-mode.service"
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
      <label class="switch">
        <input type="checkbox" [checked]="shortcutsEnabled" (change)="onToggle($any($event.target).checked)" />
        Atalhos de teclado ligados
      </label>
      <p class="switch-hint">
        Desligue-os se as letras colidem com o seu leitor de ecrã, ou se as
        carrega sem querer. Fica guardado.
      </p>
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

    .switch {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-top: 20px;
      min-height: 44px;
      color: var(--text-color);
      cursor: pointer;
    }

    .switch input {
      width: 20px;
      height: 20px;
    }

    .switch-hint {
      margin: 0;
      font-size: 13px;
      color: var(--text-color);
      opacity: 0.8;
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
  private readonly studyMode = inject(StudyModeService)
  readonly shortcuts = STUDY_SHORTCUTS

  get shortcutsEnabled(): boolean {
    return this.studyMode.shortcutsEnabled
  }

  onToggle(enabled: boolean): void {
    this.studyMode.setShortcutsEnabled(enabled)
  }
}
