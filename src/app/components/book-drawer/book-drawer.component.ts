import { ChangeDetectionStrategy, Component, inject } from "@angular/core"
import { toSignal } from "@angular/core/rxjs-interop"
import { MatButtonModule } from "@angular/material/button"
import {
  MAT_DIALOG_DATA,
  MatDialogClose,
  type MatDialogConfig,
  MatDialogRef,
} from "@angular/material/dialog"
import { MatIconModule } from "@angular/material/icon"
import { BookService } from "../../services/book.service"
import { BookSelectorComponent } from "../book-selector/book-selector.component"

/**
 * The reader's book list, for a page that has no drawer of its own: a panel
 * down the screen's left edge with the same selector and close button. Closes
 * with the book chosen.
 */
@Component({
  selector: "book-drawer",
  imports: [
    MatButtonModule,
    MatIconModule,
    MatDialogClose,
    BookSelectorComponent,
  ],
  template: `
    <button type="button" matIconButton class="dismiss-button" aria-label="Fechar" mat-dialog-close>
      <mat-icon>menu_open</mat-icon>
    </button>
    <book-selector [books]="books()" [selectedBookId]="data?.selectedBookId"
      (submitData)="close($event.bookId)"></book-selector>
  `,
  styles: `
    :host {
      display: block;
      height: 100%;
    }
    .dismiss-button {
      position: absolute;
      top: 4px;
      right: 8px;
      z-index: 1000;
      width: 48px;
      height: 48px;
      min-width: 48px;
      background-color: transparent;
    }
    .dismiss-button .mat-icon {
      font-size: 24px;
      width: 24px;
      height: 24px;
      background-color: var(--card-background);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BookDrawerComponent {
  protected readonly data = inject<{ selectedBookId?: string } | null>(
    MAT_DIALOG_DATA,
    { optional: true },
  )
  private readonly dialogRef = inject(MatDialogRef<BookDrawerComponent>)
  /** Live: the list may still be loading, or load again, while this is open. */
  protected readonly books = toSignal(inject(BookService).books$, {
    initialValue: [],
  })

  protected close(bookId: string): void {
    this.dialogRef.close(bookId)
  }
}

/** Where and how it opens: full height, the reader's drawer's width. */
export const BOOK_DRAWER_CONFIG = (
  selectedBookId?: string,
): MatDialogConfig => ({
  id: "book-drawer",
  data: { selectedBookId },
  panelClass: "book-drawer-panel",
  ariaLabel: "Livros",
  ariaModal: true,
  restoreFocus: true,
  position: { top: "0", left: "0" },
  height: "100dvh",
  width: "515px",
  maxWidth: "100vw",
  enterAnimationDuration: 0,
  exitAnimationDuration: 0,
})
