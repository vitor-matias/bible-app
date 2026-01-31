import { Injectable } from "@angular/core"
import { BookService } from "./book.service"

// ---------------- Types (unchanged) ----------------
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
  match: string
  index: number
  book: string
  chapter: number
  verses?: VerseReference[]
  crossChapter?: CrossChapterRange
}

@Injectable({ providedIn: "root" })
export class BibleReferenceService {
  private bookAlternation = ""
  private explicitRe?: RegExp

  // Implicit full ref (no book): same-chapter "2,4b-25" OR cross-chapter "38,1-39,30"
  // IMPORTANT: cross-chapter branch (endCh,endV) is placed BEFORE same-chapter v2 to avoid greedy misparse.
  private implicitFullRe =
    /\b(?<chapter>\d+)\s*(?:[:.]|,(?!\s))\s*(?<v1>\d+(?:[a-c])?)(?:\s*[-\u2010-\u2015\u2212]\s*(?:(?<endCh>\d+)\s*(?:[:.]|,(?!\s))\s*(?<endV>\d+(?:[a-c])?)|(?<v2>\d+(?:[a-c])?)))?\b/gi

  // Chapter-only AFTER a semicolon:  "... ; 104 ; ..."  (reuse last explicit/current book)
  private tailChapterOnlyRe =
    /\s*;\s*(?<tail>(?<chapter>\d+))(?!\s*[:.,]\d)\b/gi

  // Verse-only shorthand (uses current book + current chapter): "v.12" / "v.12-13" / "v.2a"
  private verseOnlyRe =
    /\bv\.?\s*(?<v1>\d+(?:[a-c])?)(?:\s*[-\u2010-\u2015\u2212]\s*(?<v2>\d+(?:[a-c])?))?\b/gi

  constructor(private bookService: BookService) {
    this.bookService.books$.subscribe(() => {
      this.rebuildPattern()
    })
  }

  /** Call if your books list changes at runtime */
  rebuildPattern(): void {
    const stripDiacritics = (value: string) =>
      value.normalize("NFD").replace(/[\u0300-\u036f]/g, "")

    // 1) Abbreviations + short names from your service (e.g., "Gn", "Gênesis").
    const raw = (
      this.bookService
        .getBooks()
        ?.flatMap((b) => [b.abrv, b.shortName].map((s) => (s ?? "").trim())) ??
      []
    ).filter(Boolean)

    // 2) Normalize to base names by stripping any leading 1\u20133 and optional space.
    //    Lets the regex handle both "2Sm" and "2 Sm".
    const base = raw
      .flatMap((s) => {
        const stripped = stripDiacritics(s)
        const singular =
          s.length > 1 && s.toLocaleLowerCase().endsWith("s")
            ? s.slice(0, -1)
            : ""
        const singularStripped =
          stripped.length > 1 && stripped.toLocaleLowerCase().endsWith("s")
            ? stripped.slice(0, -1)
            : ""
        return [s, stripped, singular, singularStripped].filter(Boolean)
      })
      .map((s) => s.replace(/^[1-3]\s*/i, "")) // "1Sm" \u2192 "Sm", "2 Sm" \u2192 "Sm"
      .map((s) => s.toLocaleLowerCase())

    // 3) Dedup, escape, sort longer->shorter to avoid partial shadowing.
    const escaped = Array.from(new Set(base))
      .filter((s) => s.length > 0)
      .sort((a, b) => b.length - a.length)
      .map((s) => s.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&"))

    // 4) Optional numeric prefix (1\u20133) + optional space, then known book base.
    //    Captures the FULL visible book (e.g., "2 Sm", "2Sm", "Sm") in the named group.
    this.bookAlternation = `(?:(?:[1-3])\\s*)?(?:${escaped.join("|")})`

    // Explicit refs support:
    //  - same-chapter:  Book <sp> Chapter [:.,] v1 [- v2]
    //  - cross-chapter: Book <sp> Chapter [:.,] v1 - endCh [:.,] endV
    // Note: cross-chapter branch FIRST to handle "Jb 38,1-39,30" correctly.
    const pattern =
      String.raw`\b(?<book>${this.bookAlternation})\s+(?<chapter>\d+)` +
      String.raw`(?:\s*(?:[:.]|,(?!\s))\s*(?<v1>\d+(?:[a-c])?)` +
      String.raw`(?:\s*[-\u2010-\u2015\u2212]\s*(?:(?<endCh>\d+)\s*(?:[:.]|,(?!\s))\s*(?<endV>\d+(?:[a-c])?)|(?<v2>\d+(?:[a-c])?)))?` +
      String.raw`)?\b`

    this.explicitRe = new RegExp(pattern, "gi")
  }

  extract(
    text: string,
    currentBook?: string,
    currentChapter?: number,
  ): BibleReference[] {
    if (!text) return []
    if (!this.explicitRe) this.rebuildPattern()

    const out: BibleReference[] = []
    const used: Array<[number, number]> = []

    const overlaps = (s: number, e: number) =>
      used.some(([a, b]) => a < e && s < b)
    const push = (ref: BibleReference) => {
      out.push(ref)
      used.push([ref.index, ref.index + ref.match.length])
    }

    // -------- 1) Explicit refs (book present) --------
    const explicitAnchors: Array<{ index: number; book: string }> = []
    this.explicitRe!.lastIndex = 0

    for (const m of text.matchAll(this.explicitRe!)) {
      const gs = m.groups as
        | {
            book: string
            chapter: string
            v1?: string
            v2?: string
            endCh?: string
            endV?: string
          }
        | undefined
      if (!gs) continue

      const start = m.index ?? 0
      const book = gs.book.trim()
      const startChapter = Number(gs.chapter)

      explicitAnchors.push({ index: start, book })

      if (gs.endCh && gs.endV && gs.v1) {
        // Cross-chapter ... (unchanged)
        const { num: sv, part: sp } = this.parseNumPart(gs.v1)
        const endChapter = Number(gs.endCh)
        const { num: ev, part: ep } = this.parseNumPart(gs.endV)
        push({
          match: m[0],
          index: start,
          book,
          chapter: startChapter,
          crossChapter: {
            type: "crossChapterRange",
            startChapter,
            startVerse: sv,
            startPart: sp,
            endChapter,
            endVerse: ev,
            endPart: ep,
          },
        })
      } else {
        // Same-chapter (with or without verses)
        const verses = this.buildVerses(gs.v1, gs.v2) || []
        let matchStr = m[0]
        let currentIdx = start + matchStr.length

        // Look for comma-separated additions: ", 12" or ", 12-14"
        const commaRe = /^\s*,\s*(?<v1>\d+(?:[a-c])?)(?:\s*[-\u2010-\u2015\u2212]\s*(?<v2>\d+(?:[a-c])?))?/
        
        while (true) {
          const tail = text.slice(currentIdx)
          const cm = commaRe.exec(tail)
          if (!cm) break

          const nextVerses = this.buildVerses(cm.groups!['v1'], cm.groups!['v2'])
          if (nextVerses) {
            verses.push(...nextVerses)
            matchStr += cm[0]
            currentIdx += cm[0].length
          } else {
            break
          }
        }

        push({
          match: matchStr,
          index: start,
          book,
          chapter: startChapter,
          verses: verses.length ? verses : undefined,
        })
      }
    }

    // helper: find nearest explicit book BEFORE a given index
    const bookBefore = (i: number): string | undefined => {
      let last: string | undefined
      for (const a of explicitAnchors) {
        if (a.index < i) last = a.book
        else break
      }
      return last
    }

    // -------- 2) Implicit full refs: same-chapter or cross-chapter --------
    this.implicitFullRe.lastIndex = 0
    for (const m of text.matchAll(this.implicitFullRe)) {
      const gs = m.groups as
        | {
            chapter: string
            v1: string
            v2?: string
            endCh?: string
            endV?: string
          }
        | undefined
      if (!gs) continue

      const s = m.index ?? 0
      const e = s + m[0].length
      if (overlaps(s, e)) continue

      const book = bookBefore(s) ?? currentBook?.trim()
      if (!book) continue // no context: skip

      const startChapter = Number(gs.chapter)

      if (gs.endCh && gs.endV) {
        // Cross-chapter
        const { num: sv, part: sp } = this.parseNumPart(gs.v1)
        const endChapter = Number(gs.endCh)
        const { num: ev, part: ep } = this.parseNumPart(gs.endV)
        push({
          match: m[0],
          index: s,
          book,
          chapter: startChapter,
          crossChapter: {
            type: "crossChapterRange",
            startChapter,
            startVerse: sv,
            startPart: sp,
            endChapter,
            endVerse: ev,
            endPart: ep,
          },
        })
      } else {
        // Same-chapter
        push({
          match: m[0],
          index: s,
          book,
          chapter: startChapter,
          verses: this.buildVerses(gs.v1, gs.v2),
        })
      }
    }

    // -------- 3) Tail chapter-only after semicolon:  "; 104" --------
    this.tailChapterOnlyRe.lastIndex = 0
    for (const m of text.matchAll(this.tailChapterOnlyRe)) {
      const gs = m.groups as { tail: string; chapter: string } | undefined
      if (!gs) continue
      const innerOffset = m[0].indexOf(gs.tail)
      const s = (m.index ?? 0) + innerOffset
      const e = s + gs.tail.length
      if (overlaps(s, e)) continue

      const book = bookBefore(s) ?? currentBook?.trim()
      if (!book) continue // no context: skip

      push({
        match: gs.tail, // "104" (no leading "; ")
        index: s,
        book,
        chapter: Number(gs.chapter),
      })
    }

    // -------- 4) Verse-only shorthand: "v.12" / "v.12-13" --------
    if (currentBook && currentChapter != null) {
      this.verseOnlyRe.lastIndex = 0
      for (const m of text.matchAll(this.verseOnlyRe)) {
        const gs = m.groups as { v1: string; v2?: string } | undefined
        if (!gs) continue

        const s = m.index ?? 0
        const e = s + m[0].length
        if (overlaps(s, e)) continue

        push({
          match: m[0],
          index: s,
          book: currentBook.trim(),
          chapter: currentChapter,
          verses: this.buildVerses(gs.v1, gs.v2),
        })
      }
    }

    return out.sort((a, b) => a.index - b.index)
  }

  // ---- helpers --------------------------------------------------------------

  private parseNumPart(s: string): { num: number; part?: "a" | "b" | "c" } {
    const m = /^(\d+)([a-c])?$/i.exec(s.trim())
    return m
      ? {
          num: Number(m[1]),
          ...(m[2] ? { part: m[2].toLowerCase() as "a" | "b" | "c" } : {}),
        }
      : { num: Number(s) }
  }

  private buildVerses(v1?: string, v2?: string): VerseReference[] | undefined {
    if (!v1) return undefined
    const a = this.parseNumPart(v1)
    if (!v2) {
      return [{ type: "single", verse: a.num, ...(a.part ? { part: a.part } : {}) }]
    }
    const b = this.parseNumPart(v2)

    const range: Extract<VerseReference, { type: "range" }> = {
      type: "range",
      start: Math.min(a.num, b.num),
      end: Math.max(a.num, b.num),
    }

    if (a.part) range.startPart = a.part
    if (b.part) range.endPart = b.part

    return [range]
  }
}
