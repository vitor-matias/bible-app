import { Component, Inject } from "@angular/core";
import { MatButtonModule } from "@angular/material/button"
import { MAT_SNACK_BAR_DATA, type MatSnackBarRef } from '@angular/material/snack-bar';
import type { Router } from "@angular/router"


@Component({
  selector: 'app-two-action-snack',
  imports: [    MatButtonModule],
  template: `
    <span class="message">{{ data.message }}</span>
    <span class="spacer"></span>
    <button mat-button (click)="goBack()">Voltar</button>
    <button mat-button (click)="dismiss()">Fechar</button>
  `,
  styles: [`
    :host {
      display: flex;
      align-items: center;
      width: 100%;
    }
    .spacer { flex: 1 1 auto; }
    .message {
      color: antiquewhite;
    }
    :host ::ng-deep .mat-mdc-button .mdc-button__label {
  color: antiquewhite;
}
  `]
})
export class TwoActionSnackComponent {
  constructor(
    @Inject(MAT_SNACK_BAR_DATA) public data: { message: string, returnUrl?: () => void },
    private router: Router,
    private snackBarRef: MatSnackBarRef<TwoActionSnackComponent>
  ) {}

  goBack() {
    if (this.data.returnUrl) {
      this.data.returnUrl();
    }
    this.snackBarRef.dismiss();
  }

  dismiss() {
    this.snackBarRef.dismiss();
  }
}
