import { ChangeDetectionStrategy, Component } from "@angular/core"
import { MatButtonModule } from "@angular/material/button"
import { type MatDialogConfig, MatDialogModule } from "@angular/material/dialog"
import { RouterLink } from "@angular/router"

/** The policy's text, bundled so it opens without a connection. */
@Component({
  selector: "privacy-policy",
  templateUrl: "./privacy-policy.component.html",
  styleUrl: "./privacy-policy.component.css",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PrivacyPolicyComponent {}

@Component({
  selector: "privacy-policy-dialog",
  imports: [PrivacyPolicyComponent, MatDialogModule, MatButtonModule],
  template: `
    <h2 mat-dialog-title>Política de Privacidade</h2>
    <mat-dialog-content class="policy-scroll"><privacy-policy /></mat-dialog-content>
    <mat-dialog-actions align="end">
      <button type="button" mat-button mat-dialog-close>Fechar</button>
    </mat-dialog-actions>
  `,
  styles: ".policy-scroll { max-height: none; flex: 1 1 auto; }",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PrivacyPolicyDialogComponent {}

/** Focus stays on the dialog, so a link in the text doesn't scroll it on open. */
export const PRIVACY_DIALOG_CONFIG: MatDialogConfig = {
  width: "90%",
  maxWidth: "640px",
  panelClass: "privacy-dialog-panel",
  autoFocus: "dialog",
}

/** The public address App Store Connect and Google Play link to. */
@Component({
  selector: "privacy-policy-page",
  imports: [PrivacyPolicyComponent, RouterLink],
  template: `
    <main class="policy-page">
      <h1>Política de Privacidade</h1>
      <privacy-policy />
      <p><a routerLink="/">Voltar à Bíblia</a></p>
    </main>
  `,
  styles: `
    :host { display: block; height: 100%; overflow-y: auto; }
    .policy-page { max-width: 640px; margin: 0 auto; padding: 24px 16px calc(24px + var(--app-inset-bottom)); }
    h1 { font-size: 1.5rem; }
    a { color: inherit; }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PrivacyPolicyPageComponent {}
