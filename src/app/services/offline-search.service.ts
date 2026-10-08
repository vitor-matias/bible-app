import { Injectable, inject } from "@angular/core"
import { NEW_TESTAMENT_GROUPS, OLD_TESTAMENT_GROUPS } from "../bible-canon"
import { foldText, searchWords, verseText } from "../utils/text-search"
import { OfflineDataService } from "./offline-data.service"

interface IndexedVerse {
  verse: Verse
  /**
   * The verse's words, folded (foldText), between single spaces:
   * " pai nosso que estas no ceu ". Punctuation and hyphens count as spaces,
   * so "Pai-nosso" matches "pai nosso", and a query word matches the words it
   * begins ("luz": "luz", "luzes"; not "reluz").
   */
  words: string
}

/** The books in the edition's canonical order. */
const CANON = [...OLD_TESTAMENT_GROUPS, ...NEW_TESTAMENT_GROUPS].flatMap(
  (group) => group.books,
)

/**
 * Word search over the Bible stored on the device (OfflineDataService), for
 * when the server's search, which goes by meaning, is out of reach. It finds
 * the verses that contain every word of the query, accents and case aside:
 * first those with the words as typed, together ("Pai nosso" in Mt 6,9), then
 * the rest ("o nosso pai"), each in the order of the Bible.
 */
@Injectable({
  providedIn: "root",
})
export class OfflineSearchService {
  private readonly offlineData = inject(OfflineDataService)
  /** Built on the first search and kept while the stored books stay the same. */
  private index?: { books: Book[]; verses: IndexedVerse[] }

  /** The matching verses, or null when no Bible is stored on the device. */
  async search(query: string): Promise<Verse[] | null> {
    const verses = await this.indexedVerses()
    if (!verses.length) return null
    const words = searchWords(query)
    if (!words.length) return []
    // The whole query ranks a verse first, one-letter words too ("Deus é
    // amor"); the words without them decide whether it matches at all.
    const phrase = foldText(query)
      .split(/[^\p{L}\p{N}]+/u)
      .filter(Boolean)
      .join(" ")
    const together: Verse[] = []
    const apart: Verse[] = []
    for (const entry of verses) {
      if (!words.every((word) => entry.words.includes(` ${word}`))) continue
      if (entry.words.includes(` ${phrase} `)) together.push(entry.verse)
      else apart.push(entry.verse)
    }
    return [...together, ...apart]
  }

  private async indexedVerses(): Promise<IndexedVerse[]> {
    const books = await this.offlineData.getCachedBooksAsync()
    if (this.index?.books === books) return this.index.verses

    const position = (book: Book) => {
      const index = CANON.indexOf(book.id)
      return index === -1 ? CANON.length : index
    }
    const verses: IndexedVerse[] = []
    for (const book of [...books].sort((a, b) => position(a) - position(b))) {
      const chapters = [...(book.chapters ?? [])].sort(
        (a, b) => a.number - b.number,
      )
      for (const chapter of chapters) {
        for (const verse of chapter.verses ?? []) {
          // Verse 0 holds a chapter's headings, not its text.
          if (verse.number < 1) continue
          const words = foldText(verseText(verse))
            .split(/[^\p{L}\p{N}]+/u)
            .filter(Boolean)
            .join(" ")
          verses.push({ verse, words: ` ${words} ` })
        }
      }
    }
    this.index = { books, verses }
    return verses
  }
}
