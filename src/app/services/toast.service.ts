import { Injectable, inject } from "@angular/core"
import { MatSnackBar } from "@angular/material/snack-bar"
import { NavigationEnd, NavigationStart, Router } from "@angular/router"
import type { Observable, Subscription } from "rxjs"
import { TwoActionSnackComponent } from "../components/two-action-snackbar/two-action-snackbar.component"
import { BookService } from "./book.service"
import { NativeChromeService } from "./native-chrome.service"

export interface ToastOptions {
  /** The snackbar's button on the web ("" for none); the native toast has none. */
  action?: string
  duration?: number
}

/**
 * A short message: a Material snackbar on the web, a native glass toast in
 * the iOS app, a native Material snackbar in the Android app
 * (NativeChromeService).
 */
@Injectable({
  providedIn: "root",
})
export class ToastService {
  private readonly snackBar = inject(MatSnackBar)
  private readonly nativeChrome = inject(NativeChromeService)
  private readonly bookService = inject(BookService)
  private readonly router = inject(Router)
  /** Takes down the "Voltar para …" showing, if any; see showReturn. */
  private returnWatch?: Subscription

  show(message: string, options: ToastOptions = {}): void {
    // It replaces the way back, if that is showing.
    this.returnWatch?.unsubscribe()
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
    this.returnWatch?.unsubscribe()
    const verseNumber = from.number > 0 ? from.number : 1
    const book = this.bookService.findBook(from.bookId)
    const urlAbrv = this.bookService.getUrlAbrv(book)
    const message = `Voltar para ${book.shortName} ${from.chapterNumber},${verseNumber}`
    const goBack = () =>
      this.router.navigate([urlAbrv, from.chapterNumber], {
        queryParams: { verseStart: verseNumber, highlight: false },
      })

    // The way back is the button, as Books' "Back to Page" is: the iOS glass
    // toast, or the snackbar elsewhere.
    if (this.nativeChrome.enabled) {
      const hide = this.nativeChrome.toast(message, {
        symbol: "arrow.uturn.backward",
        onTap: goBack,
      })
      this.returnWatch = this.hideOnReturn(urlAbrv, from.chapterNumber, hide)
      return
    }
    const snack = this.snackBar.openFromComponent(TwoActionSnackComponent, {
      data: { message, returnUrl: goBack },
    })
    this.returnWatch = this.hideOnReturn(
      urlAbrv,
      from.chapterNumber,
      () => snack.dismiss(),
      snack.afterDismissed(),
    )
  }

  /**
   * The way back goes once the reader has gone back by another route: the back
   * gesture, Android's back button or the browser's (any step through
   * history), or anything that brings them back to its chapter, such as the
   * passage picker. Reading on from the reference keeps it, as Books does;
   * leaving the text for search or the book list doesn't.
   */
  private hideOnReturn(
    urlAbrv: string,
    chapter: number,
    hide: () => void,
    closed?: Observable<unknown>,
  ): Subscription {
    // A reference within the chapter doesn't leave it, so landing there
    // isn't a return.
    let away = !this.isChapter(this.router.url, urlAbrv, chapter)
    const watch = this.router.events.subscribe((event) => {
      let done = false
      if (event instanceof NavigationStart) {
        done = event.navigationTrigger === "popstate"
      } else if (event instanceof NavigationEnd) {
        const url = event.urlAfterRedirects
        const here = this.isChapter(url, urlAbrv, chapter)
        done = (here && away) || !this.isReader(url)
        away ||= !here
      }
      if (!done) return
      watch.unsubscribe()
      hide()
    })
    if (closed) watch.add(closed.subscribe(() => watch.unsubscribe()))
    return watch
  }

  /** A passage, or the last one read (/): not search or the book list. */
  private isReader(url: string): boolean {
    const segments =
      this.router.parseUrl(url).root.children["primary"]?.segments ?? []
    return segments.length !== 1
  }

  private isChapter(url: string, urlAbrv: string, chapter: number): boolean {
    const [book, segment, ...rest] =
      this.router.parseUrl(url).root.children["primary"]?.segments ?? []
    return (
      segment !== undefined &&
      rest.length === 0 &&
      book.path.toLowerCase() === urlAbrv &&
      this.bookService.parseChapterUrlSegment(segment.path) === chapter
    )
  }
}
