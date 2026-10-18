import { ChangeDetectionStrategy, Component, Inject } from "@angular/core"
import { MatButtonModule } from "@angular/material/button"
import { MatIconModule } from "@angular/material/icon"
import { MAT_SNACK_BAR_DATA, MatSnackBarRef } from "@angular/material/snack-bar"

/**
 * The way back after following a reference: the whole message is the button
 * ("↩ Voltar para João 1,18"), with a close button beside it. A question with
 * Voltar and Fechar under it said the same thing twice.
 */
@Component({
  selector: "app-two-action-snack",
  imports: [MatButtonModule, MatIconModule],
  template: `
    <button mat-button class="go-back" (click)="goBack()">
      <mat-icon>undo</mat-icon>
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
      .go-back {
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
    public data: { message: string; returnUrl?: () => void },
    private snackBarRef: MatSnackBarRef<TwoActionSnackComponent>,
  ) {}

  goBack() {
    if (this.data.returnUrl) {
      this.data.returnUrl()
    }
    this.snackBarRef.dismiss()
  }

  dismiss() {
    this.snackBarRef.dismiss()
  }
}
