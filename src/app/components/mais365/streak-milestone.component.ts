import { ChangeDetectionStrategy, Component, inject } from "@angular/core"
import { MatButtonModule } from "@angular/material/button"
import {
  MAT_DIALOG_DATA,
  MatDialogModule,
  MatDialogRef,
} from "@angular/material/dialog"
import { MatIconModule } from "@angular/material/icon"

/** A few words for each run celebrated; the rest share one. */
const WORDS: Record<number, string> = {
  3: "Um bom começo.",
  7: "Uma semana inteira com a Palavra.",
  14: "Duas semanas, um dia de cada vez.",
  30: "Um mês inteiro com a Palavra.",
  100: "Cem dias com a Palavra.",
  365: "Um ano inteiro, dia após dia.",
}

/**
 * A streak's milestone, celebrated once: the flame, the days in a row, and a
 * way to share them. Closes with "share" when asked to.
 */
@Component({
  selector: "streak-milestone",
  imports: [MatDialogModule, MatButtonModule, MatIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="milestone">
      <mat-icon class="flame" aria-hidden="true">local_fire_department</mat-icon>
      <h2 mat-dialog-title>{{ days }} dias seguidos</h2>
      <mat-dialog-content>
        <p>{{ words }}</p>
      </mat-dialog-content>
      <mat-dialog-actions>
        <button type="button" mat-button (click)="ref.close()">Continuar</button>
        <button type="button" mat-flat-button class="share" (click)="ref.close('share')">
          <mat-icon>share</mat-icon> Partilhar
        </button>
      </mat-dialog-actions>
    </div>
  `,
  styles: `
    /* The count in the reading face, as the day's card names a day; the
       words as plain as the dialog's text, not its faint grey. */
    .milestone {
      --mat-dialog-subhead-font: var(--font-reading);
      --mat-dialog-supporting-text-color: var(--text-color);
      text-align: center;
      padding-top: 24px;
    }

    .flame {
      width: 56px;
      height: 56px;
      font-size: 56px;
      color: #c8641e;
      font-variation-settings: "FILL" 1;
      animation: kindle 600ms cubic-bezier(0.2, 0.8, 0.2, 1.2) both;
    }

    @keyframes kindle {
      from {
        transform: scale(0.4);
        opacity: 0;
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .flame {
        animation: none;
      }
    }

    mat-dialog-actions {
      justify-content: center;
      gap: 8px;
      padding-bottom: 20px;
    }

    .share {
      --mat-button-filled-container-color: #543d27;
      --mat-button-filled-label-text-color: antiquewhite;
    }
  `,
})
export class StreakMilestoneComponent {
  protected readonly ref =
    inject<MatDialogRef<StreakMilestoneComponent, "share">>(MatDialogRef)
  protected readonly days = inject<{ days: number }>(MAT_DIALOG_DATA).days
  protected readonly words =
    WORDS[this.days] ?? `${this.days} dias com a Palavra.`
}
