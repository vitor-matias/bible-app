import { Injectable, inject } from "@angular/core"
import { MatSnackBar } from "@angular/material/snack-bar"
import { Router } from "@angular/router"
import { TwoActionSnackComponent } from "../components/two-action-snackbar/two-action-snackbar.component"
import { BookService } from "./book.service"
import { NativeChromeService } from "./native-chrome.service"

export interface ToastOptions {
  /** The snackbar's button on the web ("" for none); the iOS toast has none. */
  action?: string
  duration?: number
}

/**
 * A short message: a Material snackbar on the web and Android, a native glass
 * toast in the iOS app (NativeChromeService).
 */
@Injectable({
  providedIn: "root",
})
export class ToastService {
  private readonly snackBar = inject(MatSnackBar)
  private readonly nativeChrome = inject(NativeChromeService)
  private readonly bookService = inject(BookService)
  private readonly router = inject(Router)

  show(message: string, options: ToastOptions = {}): void {
    if (this.nativeChrome.enabled) {
      this.nativeChrome.toast(message)
      return
    }
    this.snackBar.open(message, options.action ?? "Fechar", {
      duration: options.duration ?? 3000,
    })
  }

  /**
   * The way back after following a reference, from a verse's cross-references
   * or its notes: "Voltar para Gn 3,5".
   */
  showReturn(from: Pick<Verse, "bookId" | "chapterNumber" | "number">): void {
    const verseNumber = from.number > 0 ? from.number : 1
    const book = this.bookService.findBook(from.bookId)
    const message = `Voltar para ${book.shortName} ${from.chapterNumber},${verseNumber}`
    const goBack = () =>
      this.router.navigate(
        [this.bookService.getUrlAbrv(book), from.chapterNumber],
        { queryParams: { verseStart: verseNumber, highlight: false } },
      )

    // The way back is the button, as Books' "Back to Page" is: the iOS glass
    // toast, or the snackbar elsewhere.
    if (this.nativeChrome.enabled) {
      this.nativeChrome.toast(message, {
        symbol: "arrow.uturn.backward",
        onTap: goBack,
      })
      return
    }
    this.snackBar.openFromComponent(TwoActionSnackComponent, {
      data: { message, onTap: goBack },
    })
  }
}
