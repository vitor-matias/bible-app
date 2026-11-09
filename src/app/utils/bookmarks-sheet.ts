import {
  indexBookmarkLabel,
  isIndexBookmark,
} from "../pastoral-index-bookmarks"
import type {
  RibbonMove,
  RibbonState,
} from "../services/bookmark-ribbons.service"
import type { BookmarksSheetState } from "../services/native-chrome.types"
import { passageLabel } from "./passage-label"

/**
 * What the bookmarks sheet shows, built once for the web panel and, over the
 * bridge, for the iOS and Android sheets (native-bookmarks.service.ts), so the
 * three say the same things in the same words.
 */

/** The About page can't be marked: a ribbon there would lead nowhere to read. */
export function canMark(bookId: string): boolean {
  return bookId !== "about"
}

/**
 * As the passage button names it: "Mateus 11", "Salmo 96 (95)", or, on the
 * Índice Bíblico-Pastoral, the theme's title.
 */
export function sheetPassageLabel(
  findBookById: (bookId: string) => Book | undefined,
  bookId: string,
  chapter: number,
): string {
  if (isIndexBookmark(bookId)) return indexBookmarkLabel(bookId)
  const book = findBookById(bookId) ?? { id: bookId, shortName: bookId }
  // The About page has no chapters: "Sobre a Bíblia", not "… 1".
  if (!canMark(bookId)) return book.shortName
  return chapter === 0
    ? `${book.shortName} Introdução`
    : passageLabel(book, chapter)
}

export function bookmarksSheetState(
  ribbons: RibbonState[],
  bookId: string,
  chapter: number,
  mover: RibbonMove,
  label: (bookId: string, chapter: number) => string,
): BookmarksSheetState {
  const offer = canMark(bookId) ? mover.offer(ribbons) : null
  return {
    currentLabel: label(bookId, chapter),
    canMark: canMark(bookId),
    ribbons: ribbons.map((ribbon) => ({
      color: ribbon.value,
      name: ribbon.spoken,
      label: ribbon.currentRef ?? null,
      current:
        ribbon.bookmark?.bookId === bookId &&
        ribbon.bookmark?.chapter === chapter,
    })),
    move: offer
      ? {
          color: offer.from.color,
          name: offer.name,
          from: label(offer.from.bookId, offer.from.chapter),
          done: offer.done,
        }
      : null,
  }
}

/** What the ribbons do now, under them: to mark, to go back, to take off. */
export function bookmarksHint(
  state: BookmarksSheetState,
  editing: boolean,
): string {
  const anyUsed = state.ribbons.some((ribbon) => ribbon.label !== null)
  if (editing) return "Toque numa fita para a retirar."
  if (!state.canMark) {
    return anyUsed
      ? "Esta página não se pode marcar. Toque numa fita com nome para abrir essa passagem."
      : "Esta página não se pode marcar."
  }
  if (state.ribbons.some((ribbon) => ribbon.current)) {
    return `${state.currentLabel} está marcado. Toque noutra fita livre para mudar a cor.`
  }
  return anyUsed
    ? `Toque numa fita com nome para voltar a essa passagem, ou numa fita livre para marcar ${state.currentLabel}.`
    : `Escolha uma cor para marcar ${state.currentLabel}. Para voltar, abra Marcadores e toque nessa fita.`
}
