import { ChangeDetectionStrategy, Component, Inject } from "@angular/core"
import { MatButtonModule } from "@angular/material/button"
import { MatIconModule } from "@angular/material/icon"
import { MAT_SNACK_BAR_DATA, MatSnackBarRef } from "@angular/material/snack-bar"

export interface TwoActionSnackData {
  message: string
  /** Material icon before the message; the way back's arrow by default. */
  icon?: string
  onTap?: () => void
}

/**
 * A message that is itself the button, with a close button beside it: the way
 * back after following a reference ("↩ Voltar para João 1,18"), or the app's
 * store page. A question with Voltar and Fechar under it said the same thing
 * twice.
 */
@Component({
  selector: "app-two-action-snack",
  imports: [MatButtonModule, MatIconModule],
  template: `
    <button mat-button class="action" (click)="tap()">
      <mat-icon>{{ data.icon ?? "undo" }}</mat-icon>
      {{ data.message }}
    </button>
    <button mat-icon-button class="close" (click)="dismiss()" aria-label="Fechar">
      <mat-icon>close</mat-icon>
    </button>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [
    `
      :host {
        display: flex;
        align-items: center;
        gap: 4px;
        width: 100%;
      }
      .action {
        flex: 1;
        justify-content: flex-start;
      }
      :host ::ng-deep .mat-mdc-button .mdc-button__label,
      .mat-icon {
        color: antiquewhite;
      }
    `,
  ],
})
export class TwoActionSnackComponent {
  constructor(
    @Inject(MAT_SNACK_BAR_DATA)
    public data: TwoActionSnackData,
    private snackBarRef: MatSnackBarRef<TwoActionSnackComponent>,
  ) {}

  tap() {
    this.data.onTap?.()
    this.snackBarRef.dismiss()
  }

  dismiss() {
    this.snackBarRef.dismiss()
  }
}
