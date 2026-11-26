import { Location } from "@angular/common"
import { DOCUMENT, Injectable, inject } from "@angular/core"
import { MatSnackBar } from "@angular/material/snack-bar"
import {
  NavigationCancel,
  NavigationEnd,
  NavigationError,
  type NavigationExtras,
  NavigationStart,
  Router,
} from "@angular/router"
import type { Observable, Subscription } from "rxjs"
import { filter, take } from "rxjs/operators"
import { TwoActionSnackComponent } from "../components/two-action-snackbar/two-action-snackbar.component"
import { passageLabel } from "../utils/passage-label"
import {
  chapterFirstRef,
  printedNumber,
  verseRefValue,
} from "../utils/verse-ref"
import { BookService } from "./book.service"
import { isPanelEntry, pageDepth } from "./depth-location-strategy"
import { NativeChromeService } from "./native-chrome.service"

/**
 * Navigation `info` of a step to the next or previous chapter (the reader's
 * ‹ › arrows, swipes, arrow keys): reading on, which keeps "Voltar para …".
 */
export const CHAPTER_STEP = "chapter-step"

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
  private readonly document = inject(DOCUMENT)
  private readonly location = inject(Location)
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
   * Puts the snackbar showing back on top of what opened after it, as the notes
   * do over a way back. Overlays are popovers: the browser stacks them by the
   * order they were shown, whatever their z-index, so this shows it anew.
   */
  bringToFront(): void {
    const popover = this.document
      .querySelector("mat-snack-bar-container")
      ?.closest<HTMLElement>("[popover]")
    if (!popover?.matches(":popover-open")) return
    popover.hidePopover()
    // Last among the overlays too, so that their order is the stacking order
    // that styles.css reads to fade a toast under another's backdrop.
    popover.parentElement?.append(popover)
    popover.showPopover()
  }

  /**
   * The way back after following a reference, from a verse's cross-references
   * or its notes: "Voltar para Gn 3,5".
   */
  showReturn(
    from: Pick<Verse, "bookId" | "chapterNumber" | "number"> &
      Partial<Pick<Verse, "numberLabel" | "supplement">>,
  ): void {
    // As printed: a verse after one of Ester's additions is stored under
    // another number, and the link names the addition's verses by letter.
    const printed = from.number > 0 ? printedNumber(from) : 1
    // From before the first verse (a heading on verse 0) the way back is the
    // chapter's first stored verse, which an addition at its head (Est 1's A)
    // keeps from being printed verse 1.
    const verseStart =
      from.number > 0
        ? verseRefValue(from, from.bookId, from.chapterNumber)
        : chapterFirstRef(from.bookId, from.chapterNumber)
    const book = this.bookService.findBook(from.bookId)
    const urlAbrv = this.bookService.getUrlAbrv(book)
    // As the title and the share write it: "Salmo 23 (22),1", not "Salmos 23,1".
    const message = `Voltar para ${passageLabel(book, from.chapterNumber, printed)}`
    const goBack = (extras: NavigationExtras = {}) =>
      this.router.navigate([urlAbrv, from.chapterNumber], {
        queryParams: { verseStart, highlight: false },
        ...extras,
      })

    this.showWayBack(message, goBack, (url) =>
      this.isChapter(url, urlAbrv, from.chapterNumber),
    )
  }

  /** The way back after following a citation in the Índice Bíblico-Pastoral. */
  showReturnToIndex(slug: string): void {
    this.showWayBack(
      "Voltar para o Índice",
      // `replaceUrl` after a step back to an /indice with every theme open.
      (extras: NavigationExtras = {}) =>
        this.router.navigate(["/indice", slug], extras),
      (url) => this.isIndex(url),
    )
  }

  /** The way back to the +365 reflection still playing, from one of its readings. */
  showReturnToPlan(): void {
    this.showWayBack(
      "Voltar ao plano de leitura",
      (extras: NavigationExtras = {}) =>
        this.router.navigate(["/mais365"], extras),
      (url) => url.split(/[?#]/)[0] === "/mais365",
    )
  }

  private showWayBack(
    message: string,
    goTo: (extras?: NavigationExtras) => void,
    isOrigin: (url: string) => boolean,
  ): void {
    this.returnWatch?.unsubscribe()
    // Still on the page the reader leaves for the reference: its entry. Not a
    // sheet's on top of it (BackButtonService), which the reference's page
    // takes over (DepthLocationStrategy): the page's is the one beneath.
    const origin = pageDepth(this.location.getState())
    const goBack = () => {
      const state = this.location.getState()
      // Elsewhere, or no such entry (a reload, a replaced history): go there.
      if (pageDepth(state) !== origin + 1) {
        goTo()
        return
      }
      // Its entry is the one before: step back to it, so Back afterwards
      // doesn't return to the reference, then to the place in it.
      this.router.events
        .pipe(
          filter(
            (event) =>
              event instanceof NavigationEnd ||
              event instanceof NavigationCancel ||
              event instanceof NavigationError,
          ),
          take(1),
        )
        .subscribe((event) => {
          if (event instanceof NavigationEnd) goTo({ replaceUrl: true })
        })
      // Over a sheet opened since (the linked notes) too: its entry goes, and
      // the step to another address closes the sheet.
      this.location.historyGo(isPanelEntry(state) ? -2 : -1)
    }
    // The way back is the button, as Books' "Back to Page" is: the iOS glass
    // toast, or the snackbar elsewhere.
    if (this.nativeChrome.enabled) {
      const hide = this.nativeChrome.toast(message, {
        symbol: "arrow.uturn.backward",
        onTap: goBack,
        returnToPage: true,
      })
      this.returnWatch = this.hideOnReturn(isOrigin, hide)
      return
    }
    const snack = this.snackBar.openFromComponent(TwoActionSnackComponent, {
      data: { message, returnUrl: goBack },
    })
    this.returnWatch = this.hideOnReturn(
      isOrigin,
      () => snack.dismiss(),
      snack.afterDismissed(),
    )
  }

  /**
   * The way back stays only while the reader reads on from the reference,
   * chapter by chapter (CHAPTER_STEP: the ‹ › arrows, swipes, arrow keys), as
   * Books does. It goes on any other navigation (the passage picker, search, a
   * ribbon, another reference, a link), on a step through history (the back
   * gesture, Android's back button or the browser's), and once reading on
   * brings them back to where they were. In every app: the iOS pill and the
   * Android snackbar are taken down through `hide` too.
   */
  private hideOnReturn(
    isOrigin: (url: string) => boolean,
    hide: () => void,
    closed?: Observable<unknown>,
  ): Subscription {
    // A reference within the chapter doesn't leave it, so landing there
    // isn't a return.
    let away = !isOrigin(this.router.url)
    // The first navigation to end is the reference's own.
    let followed = false
    let step = false
    const watch = this.router.events.subscribe((event) => {
      let done = false
      if (event instanceof NavigationStart) {
        done = event.navigationTrigger === "popstate"
        step = this.router.currentNavigation()?.extras.info === CHAPTER_STEP
      } else if (event instanceof NavigationEnd) {
        const url = event.urlAfterRedirects
        const here = isOrigin(url)
        done = followed ? !step || (here && away) : !this.isReader(url)
        followed = true
        away ||= !here
      }
      if (!done) return
      watch.unsubscribe()
      hide()
    })
    if (closed) watch.add(closed.subscribe(() => watch.unsubscribe()))
    return watch
  }

  /** A passage, or the last one read (/): not search, the book list or the index. */
  private isReader(url: string): boolean {
    const segments =
      this.router.parseUrl(url).root.children["primary"]?.segments ?? []
    return segments.length !== 1 && !this.isIndex(url)
  }

  private isIndex(url: string): boolean {
    const [first] =
      this.router.parseUrl(url).root.children["primary"]?.segments ?? []
    return first?.path === "indice"
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
