import { ChangeDetectionStrategy, Component, inject } from "@angular/core"
import { MatButtonModule } from "@angular/material/button"
import { MatIconModule } from "@angular/material/icon"
import { MAT_SNACK_BAR_DATA, MatSnackBarRef } from "@angular/material/snack-bar"
import type { StoreLink } from "../../services/app-promo.service"

export interface AppPromptSnackData {
  message: string
  link: StoreLink
  /** On a tap on the badge, before the bar closes. */
  onOpen: () => void
}

/**
 * The one-time prompt for the native app: a short message, then the store's
 * official badge as the link. The stores allow their badge, unaltered, but not
 * their logos on their own; 40px is Apple's least on screen.
 */
@Component({
  selector: "app-prompt-snack",
  imports: [MatButtonModule, MatIconModule],
  template: `
    <span class="message">{{ data.message }}</span>
    <a class="badge" [href]="data.link.url" target="_blank" rel="noopener" (click)="open()">
      <img [src]="data.link.badge" [alt]="data.link.label" height="40">
    </a>
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
        gap: 12px;
        width: 100%;
      }
      .message {
        flex: 1;
        min-width: 0;
        color: antiquewhite;
      }
      .badge {
        flex: none;
        display: block;
        border-radius: 7px;
      }
      .badge img {
        display: block;
        width: auto;
        height: 40px;
      }
      .badge:focus-visible {
        outline: 2px solid antiquewhite;
        outline-offset: 2px;
      }
      .close {
        flex: none;
      }
      .mat-icon {
        color: antiquewhite;
      }
    `,
  ],
})
export class AppPromptSnackComponent {
  readonly data = inject<AppPromptSnackData>(MAT_SNACK_BAR_DATA)
  private readonly snackBarRef = inject(MatSnackBarRef)

  /** The link itself opens the store, in a new tab. */
  open(): void {
    this.data.onOpen()
    this.snackBarRef.dismiss()
  }

  dismiss(): void {
    this.snackBarRef.dismiss()
  }
}
