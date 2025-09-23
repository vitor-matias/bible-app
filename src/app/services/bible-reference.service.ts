import { Injectable } from "@angular/core"

export type VerseReference =
  | { type: "single"; verse: number; part?: "a" | "b" | "c" }
  | {
      type: "range"
      start: number
      end: number
      startPart?: "a" | "b" | "c"
      endPart?: "a" | "b" | "c"
    }

export type CrossChapterRange = {
  type: "crossChapterRange"
  startChapter: number
  startVerse: number
  startPart?: "a" | "b" | "c"
  endChapter: number
  endVerse: number
  endPart?: "a" | "b" | "c"
}

export interface BibleReference {
  match: string // exact text matched (tails exclude leading "; ")
  index: number // start index in source
  book: string // e.g., "Mt", "Jb", "Lc"
  chapter: number // starting chapter
  verses?: VerseReference[] // same-chapter lists/ranges
  crossChapter?: CrossChapterRange // cross-chapter range
}

@Injectable({ providedIn: "root" })
export class BibleReferenceService {
  // --- Patterns --------------------------------------------------------------

  // verse list (same chapter): 18, 18-19, 18-19.23-26, 4b, 5a-7c (comma or dot between groups)
  private static readonly SAME_CH_VERSES =
    String.raw`\d+(?:[a-c])?(?:[-\u2013]\d+(?:[a-c])?)?(?:\s*[,.]\s*\d+(?:[a-c])?(?:[-\u2013]\d+(?:[a-c])?)?)*`

  // cross-chapter block: 1-39,30 or 5a-2,52
  private static readonly CROSS_CH_VERSES =
    String.raw`\d+(?:[a-c])?\s*[-\u2013]\s*\d+\s*[,.:]\s*\d+(?:[a-c])?`

  private static readonly VERSES =
    String.raw`(?:${BibleReferenceService.SAME_CH_VERSES}|${BibleReferenceService.CROSS_CH_VERSES})`

  // book: single word (any case) OR multi-word (each word Capitalized)
  private static readonly BOOK_SINGLE = String.raw`[A-Za-z�-�]+\.?`
  private static readonly BOOK_MULTI =
    String.raw`[A-Z�-�][a-z�-�]*\.?(?:\s+[A-Z�-�][a-z�-�]*\.?)+`
  private static readonly BOOK =
    String.raw`(?:(?:${BibleReferenceService.BOOK_SINGLE})|(?:${BibleReferenceService.BOOK_MULTI}))`

  // Main explicit reference: [1-3]? Book Chapter [verses?]
  private readonly explicitRef = new RegExp(
    String.raw`\b(?:(?<booknum>[1-3])\s*)?(?<book>${BibleReferenceService.BOOK})\s*(?<chapter>\d+)(?:\s*[:.,]\s*(?<verses>${BibleReferenceService.VERSES})\b)?`,
    "g",
  )

  // Tail chunks after a semicolon that reuse the previous book
  private readonly tailRef = new RegExp(
    String.raw`\s*;\s*(?<tail>(?<chapter>\d+)(?:\s*[:.,]\s*(?<verses>${BibleReferenceService.VERSES})\b)?)`,
    "y", // sticky: continues where we left off
  )

  // Optional immediate chapter-to-chapter " - 39 " right after "Book 38"
  private readonly nextChapterAfter = /\s*[-\u2013]\s*(?<to>\d+)\b/y

  // Implicit (no book): Chapter + verses (uses currentBook if provided)
  private readonly implicitRef = new RegExp(
    String.raw`\b(?<chapter>\d+)\s*[:.,]\s*(?<verses>${BibleReferenceService.VERSES})\b`,
    "g",
  )

  // --- Public API ------------------------------------------------------------

  extract(text: string, currentBook?: string): BibleReference[] {
    if (!text) return []
    const out: BibleReference[] = []
    const used: Array<[number, number]> = []

    // 1) Explicit refs with book
    this.explicitRef.lastIndex = 0
    for (const m of text.matchAll(this.explicitRef)) {
      const gs = m.groups as
        | { booknum?: string; book: string; chapter: string; verses?: string }
        | undefined
      if (!gs) continue

      const start = m.index ?? 0
      const end = start + m[0].length
      const book = (gs.booknum ? gs.booknum.trim() + " " : "") + gs.book.trim()
      const chNum = Number(gs.chapter)

      const ref: BibleReference = {
        match: m[0],
        index: start,
        book,
        chapter: chNum,
      }
      if (gs.verses) this.fillVerses(ref, gs.verses, chNum)
      out.push(ref)
      used.push([start, end])

      // 1.a) "Book 38-39" \u2192 add chapter 39 as a separate ref
      this.nextChapterAfter.lastIndex = end
      const nca = this.nextChapterAfter.exec(text)
      if (nca?.groups?.["to"]) {
        const toStr = nca.groups["to"]
        const toNum = Number(toStr)
        const s = nca.index + nca[0].lastIndexOf(toStr)
        const e = s + toStr.length
        out.push({ match: toStr, index: s, book, chapter: toNum })
        used.push([s, e])
      }

      // 1.b) Semicolon tails reusing the same book
      this.tailRef.lastIndex = end
      while (true) {
        const t = this.tailRef.exec(text)
        if (!t) break
        const tg = t.groups as {
          tail: string
          chapter: string
          verses?: string
        }
        const inner = t[0].indexOf(tg.tail)
        const s = t.index + inner
        const e = s + tg.tail.length

        const tref: BibleReference = {
          match: tg.tail, // e.g. "24,9-14" (no leading "; ")
          index: s,
          book,
          chapter: Number(tg.chapter),
        }
        if (tg.verses) this.fillVerses(tref, tg.verses, tref.chapter)
        out.push(tref)
        used.push([s, e])
      }
    }

    // 2) Implicit refs (no book), only if currentBook provided
    if (currentBook) {
      this.implicitRef.lastIndex = 0
      for (const m of text.matchAll(this.implicitRef)) {
        const gs = m.groups as { chapter: string; verses: string } | undefined
        if (!gs) continue
        const s = m.index ?? 0
        const e = s + m[0].length
        if (used.some(([a, b]) => a < e && s < b)) continue // skip overlaps

        const ref: BibleReference = {
          match: m[0],
          index: s,
          book: currentBook.trim(),
          chapter: Number(gs.chapter),
        }
        this.fillVerses(ref, gs.verses, ref.chapter)
        out.push(ref)
        used.push([s, e])
      }
    }

    return out.sort((a, b) => a.index - b.index)
  }

  // --- Helpers ---------------------------------------------------------------

  /** Populates either `verses` (same chapter) or `crossChapter` (range across chapters). */
  private fillVerses(
    ref: BibleReference,
    versesStr: string,
    startChapter: number,
  ): void {
    const cross =
      /^(\d+)([a-c])?\s*[-\u2013]\s*(\d+)\s*[,.:]\s*(\d+)([a-c])?$/i.exec(
        versesStr.trim(),
      )
    if (cross) {
      ref.crossChapter = {
        type: "crossChapterRange",
        startChapter,
        startVerse: Number(cross[1]),
        startPart: (cross[2]?.toLowerCase() as "a" | "b" | "c") ?? undefined,
        endChapter: Number(cross[3]),
        endVerse: Number(cross[4]),
        endPart: (cross[5]?.toLowerCase() as "a" | "b" | "c") ?? undefined,
      }
      return
    }

    ref.verses = versesStr
      .split(/\s*[,.]\s*/g) // comma or dot between groups
      .filter(Boolean)
      .map<VerseReference>((grp) => {
        const [l, r] = grp.split(/[-\u2013]/).map((s) => s.trim())
        const m1 = /^(\d+)([a-c])?$/i.exec(l)
        const m2 = r ? /^(\d+)([a-c])?$/i.exec(r) : null
        if (m1 && m2) {
          const start = Number(m1[1]),
            end = Number(m2[1])
          const startPart = m1[2]?.toLowerCase() as "a" | "b" | "c" | undefined
          const endPart = m2[2]?.toLowerCase() as "a" | "b" | "c" | undefined
          return {
            type: "range",
            start: Math.min(start, end),
            end: Math.max(start, end),
            startPart,
            endPart,
          }
        }
        if (m1) {
          return {
            type: "single",
            verse: Number(m1[1]),
            part: m1[2]?.toLowerCase() as "a" | "b" | "c",
          }
        }
        return { type: "single", verse: Number(l) || 0 } // fallback
      })
  }
}
