import { Injectable, inject } from "@angular/core"
import { Router } from "@angular/router"
import type { Subscription } from "rxjs"
import {
  getVerseQueryParams,
  parseReferences,
} from "../components/verse/verse.utils"
import { passageLabel } from "../utils/passage-label"
import { AnalyticsService } from "./analytics.service"
import { BibleReferenceService } from "./bible-reference.service"
import { BookService } from "./book.service"
import {
  type FootnotesSheetState,
  NativeChromeService,
} from "./native-chrome.service"
import { PreferencesService } from "./preferences.service"

/** Where a reference in a note leads, as the web sheet's routerLink has it. */
interface FootnoteLink {
  commands: (string | number)[]
  queryParams: { verseStart: number; verseEnd?: number } | null
}

/**
 * A verse's footnotes as a native sheet in the iOS app. The references in the
 * notes stay links: the sheet reports which one was tapped, and the reader
 * opens it as the web sheet (FootnotesBottomSheetComponent) would.
 */
@Injectable({
  providedIn: "root",
})
export class NativeFootnotesService {
  private readonly nativeChrome = inject(NativeChromeService)
  private readonly bibleRef = inject(BibleReferenceService)
  private readonly bookService = inject(BookService)
  private readonly preferences = inject(PreferencesService)
  private readonly router = inject(Router)
  private readonly analytics = inject(AnalyticsService)
  private session?: Subscription

  get enabled(): boolean {
    return this.nativeChrome.enabled
  }

  open(footnotes: _Footnote[], verse: Verse): void {
    this.session?.unsubscribe()
    void this.analytics.track("footnotes_opened", {
      book: verse.bookId,
      chapter: verse.chapterNumber,
      verse: verse.number,
    })

    const links: FootnoteLink[] = []
    const notes = footnotes.map((footnote) => ({
      reference: footnote.reference,
      parts: parseReferences(
        this.bibleRef,
        footnote.text,
        verse.bookId,
        verse.chapterNumber,
      ).map((part) => {
        if (typeof part === "string") return { text: part }
        const book = this.bookService.findBook(part.book)
        links.push({
          commands: ["/", this.bookService.getUrlAbrv(book), part.chapter],
          queryParams: getVerseQueryParams(part.verses, part.crossChapter),
        })
        return { text: part.match, link: links.length - 1 }
      }),
    }))

    const state: FootnotesSheetState = {
      title: this.title(verse),
      fontScale: (this.preferences.getFontSize("footnotes") ?? 100) / 100,
      notes,
    }
    this.nativeChrome.showFootnotes(state)

    const session = this.nativeChrome.actions$.subscribe((action) => {
      if (action.id === "footnotes-closed") session.unsubscribe()
      if (action.id !== "footnote-link") return
      const link = links[action.index]
      if (!link) return
      this.router.navigate(
        link.commands,
        link.queryParams ? { queryParams: link.queryParams } : {},
      )
    })
    this.session = session
  }

  /**
   * "Mateus 11,3", "Salmo 23 (22),1", or the chapter alone for notes before
   * the first verse.
   */
  private title(verse: Verse): string {
    const book = this.bookService.findBookById(verse.bookId) ?? {
      id: verse.bookId,
      shortName: verse.bookId,
    }
    return passageLabel(
      book,
      verse.chapterNumber,
      verse.number > 0 ? verse.number : undefined,
    )
  }
}
