import { Injectable, inject } from "@angular/core"
import { BookService } from "./book.service"

// ---------------- Types (unchanged) ----------------
/** A part of a verse: "16b" is the second. */
export type VersePart = "a" | "b" | "c"

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
  /**
   * The last chapter of a run of whole chapters — "Jb 38-39". Distinct from
   * crossChapter, which runs between two *verses* in different chapters; here
   * no verse is named on either end.
   */
  endChapter?: number
}

/** The place a search names, as opposed to words it asks for. */
export type SearchDestination = {
  book: Book
  chapter: Chapter["number"]
  verseStart?: Verse["number"]
}

const stripDiacritics = (value: string) =>
  value.normalize("NFD").replace(/[\u0300-\u036f]/g, "")

const compactName = (name: string) =>
  stripDiacritics(name).replace(/\s+/g, "").toLocaleLowerCase()

/** The end of a one-chapter book's range, "-7" in "Jd 6-7"; not "-2,4", a chapter's. */
const ONE_CHAPTER_RANGE_RE =
  /^\s*[-‐-―−]\s*(?<v2>\d+(?:[a-c]{1,2})?)(?!\d|[,:]\d)/

@Injectable({ providedIn: "root" })
export class BibleReferenceService {
  private bookService = inject(BookService)

  private bookAlternation = ""
  private explicitRe?: RegExp
  /**
   * A book's name with its own reference after a comma or a spaced dot ("Jo
   * 3,16, 2 Cor 5,17"): the next reference, not more verses of this one.
   */
  private nextBookRe?: RegExp
  /** Books of a single chapter, whose lone number is a verse ("Jd 9"). */
  private oneChapterBooks = new Set<string>()

  // Implicit full ref (no book): same-chapter "2,4b-25" OR cross-chapter "38,1-39,30"
  // IMPORTANT: cross-chapter branch (endCh,endV) is placed BEFORE same-chapter v2 to avoid greedy misparse.
  // Its end takes no dot: a dot after a range starts the next verses
  // ("Gn 15,20-21.29"), not a chapter ("21.29").
  private implicitFullRe =
    /\b(?<chapter>\d+)\s*(?:[:.]|,(?!\s))\s*(?<v1>\d+(?:[a-c]{1,2})?)(?:\s*[-\u2010-\u2015\u2212]\s*(?:(?<endCh>\d+)\s*(?::|,(?!\s))\s*(?<endV>\d+(?:[a-c]{1,2})?)|(?<v2>\d+(?:[a-c]{1,2})?)))?\b/gi

  // Chapter-only AFTER a semicolon:  "... ; 104 ; ..."  (reuse last explicit/current book)
  private tailChapterOnlyRe =
    /\s*;\s*(?<tail>(?<chapter>\d+))(?!\s*[:.,]\d)\b/gi

  // Verse-only shorthand (uses current book + current chapter): "v.12" / "v.12-13" / "v.2a" / "v.24.32"
  private verseOnlyRe =
    /\bv\.?\s*(?<v1>\d+(?:[a-c]{1,2})?)(?:\s*[-\u2010-\u2015\u2212]\s*(?<v2>\d+(?:[a-c]{1,2})?))?\b/gi

  constructor() {
    this.bookService.books$.subscribe(() => {
      this.rebuildPattern()
    })
  }

  /** Call if your books list changes at runtime */
  rebuildPattern(): void {
    this.oneChapterBooks = new Set(
      this.bookService
        .getBooks()
        ?.filter((b) => b.chapterCount === 1)
        .flatMap((b) => [b.abrv, b.shortName, b.name, b.id])
        .filter(Boolean)
        .map(compactName),
    )

    // 1) Abbreviations, short names, ids, and full names from your service (e.g., "Gn", "Gênesis", "gen").
    const raw = (
      this.bookService
        .getBooks()
        ?.flatMap((b) =>
          [b.abrv, b.shortName, b.name, b.id].map((s) => (s ?? "").trim()),
        ) ?? []
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
    //  - cross-chapter: Book <sp> Chapter [:.,] v1 - endCh [:,] endV
    // Note: cross-chapter branch FIRST to handle "Jb 38,1-39,30" correctly.
    const pattern =
      String.raw`\b(?<book>${this.bookAlternation})\s+(?<chapter>\d+)` +
      String.raw`(?:\s*(?:[:.]|,(?!\s))\s*(?<v1>\d+(?:[a-c]{1,2})?)` +
      String.raw`(?:\s*[-\u2010-\u2015\u2212]\s*(?:(?<endCh>\d+)\s*(?::|,(?!\s))\s*(?<endV>\d+(?:[a-c]{1,2})?)|(?<v2>\d+(?:[a-c]{1,2})?)))?` +
      // Whole chapters, no verse named on either side: "Jb 38-39". Only when
      // no verse follows the second number, so "Jb 38,1-39,30" still parses
      // as the verse range it is, through the branch above — and only when
      // the number is not the front of the next book, so "1 Sm 31 - 2 Sm 1"
      // stays two references instead of "1 Sm 31-2" and an orphaned "Sm 1".
      String.raw`|\s*[-\u2010-\u2015\u2212]\s*(?<endChapterOnly>\d+)(?!\s*(?:[:.]|,(?!\s))\s*\d)` +
      String.raw`(?!\s*(?:${this.bookAlternation})\s+\d)` +
      String.raw`)?\b`

    this.explicitRe = new RegExp(pattern, "gi")
    this.nextBookRe = new RegExp(
      String.raw`^(?:\s*\(n\))?(?:\s*,\s*|\.\s+)(?:${this.bookAlternation})\s+\d`,
      "i",
    )
  }

  /**
   * Where a search should land, when what was typed names a place rather
   * than something to look for: a reference ("Mt 22,37"), or a book by name
   * or abbreviation. Null when it is words to search for.
   *
   * Here so that every search box answers the same way. The study panel's
   * had its own, which sent "Mt 22,37" to the text search and listed verses
   * containing "22" instead of opening Matthew 22.
   */
  destinationOf(text: string): SearchDestination | null {
    const query = text.trim()
    const [reference] = this.extract(query)
    // A place only when the reference is the whole query. extract() finds
    // references inside any text, so "amor em Mt 22,37" would otherwise open
    // Matthew 22 instead of searching for the words around it.
    const whole =
      reference !== undefined &&
      !query.slice(0, reference.index).trim() &&
      !query.slice(reference.index + reference.match.length).trim()
    if (reference && whole) {
      // The book of the Bible the text names: "joao 3,16" is the Gospel, not
      // the introduction to the Letters of John, which has the id "joao".
      const book = this.bookService.findTypedBook(reference.book)
      if (!book) return null
      const first = reference.verses?.[0]
      return {
        book,
        chapter: reference.chapter || 1,
        verseStart:
          first === undefined
            ? reference.crossChapter?.startVerse
            : first.type === "single"
              ? first.verse
              : first.start,
      }
    }
    if (reference) return null
    // A bare name may also be an introduction's ("Pentateuco"), which only
    // findBook knows, and which answers with the About page for a name it
    // does not know either.
    const book =
      this.bookService.findTypedBook(query) ?? this.bookService.findBook(query)
    return !book || book.id === "about" ? null : { book, chapter: 1 }
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
      // Track occupied spans so looser fallback patterns do not duplicate a
      // reference that was already matched by a more explicit rule.
      out.push(ref)
      used.push([ref.index, ref.index + ref.match.length])
    }

    // -------- 1) Explicit refs (book present) --------
    const explicitAnchors: Array<{ index: number; book: string }> = []
    if (!this.explicitRe) this.rebuildPattern()
    // rebuildPattern guarantees explicitRe is set, but to be safe and satisfy linter:
    const explicitRe = this.explicitRe
    if (!explicitRe) return []
    explicitRe.lastIndex = 0

    for (const m of text.matchAll(explicitRe)) {
      const gs = m.groups as
        | {
            book: string
            chapter: string
            v1?: string
            v2?: string
            endCh?: string
            endV?: string
            endChapterOnly?: string
          }
        | undefined
      if (!gs) continue

      const start = m.index ?? 0
      const book = gs.book.trim()
      const startChapter = Number(gs.chapter)

      explicitAnchors.push({ index: start, book })
      const oneChapter = this.oneChapterBooks.has(compactName(book))

      if (gs.endChapterOnly && !oneChapter) {
        // A run of whole chapters: no verse is named, so the reference points
        // at the first of them and says how far it runs. Not in a book of one
        // chapter, whose "Jd 6-7" is verses.
        push({
          match: m[0],
          index: start,
          book,
          chapter: startChapter,
          endChapter: Number(gs.endChapterOnly),
        })
      } else if (gs.endCh && gs.endV && gs.v1) {
        // Cross-chapter ... (unchanged)
        const { num: sv, part: sp } = this.parseNumPart(gs.v1)
        const endChapter = Number(gs.endCh)
        const { num: ev, part, lastPart } = this.parseNumPart(gs.endV)
        const ep = lastPart ?? part
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
        const lastIsVerse = !gs.v1 && oneChapter
        // Its range has no comma to come after: "Jd 6-7". The pattern may have
        // taken the range already, as a run of chapters.
        const range =
          lastIsVerse && !gs.endChapterOnly
            ? ONE_CHAPTER_RANGE_RE.exec(text.slice(start + m[0].length))
            : null
        const verses =
          (lastIsVerse
            ? this.buildVerses(
                gs.chapter,
                gs.endChapterOnly ?? range?.groups?.["v2"],
              )
            : this.buildVerses(gs.v1, gs.v2)) || []
        const head = m[0] + (range?.[0] ?? "")
        const matchStr =
          head + this.takeVerseList(text, start + head.length, verses)

        push({
          match: matchStr,
          index: start,
          book,
          chapter: lastIsVerse ? 1 : startChapter,
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

    // -------- 4) Verse-only shorthand: "v.12" / "v.12-13" --------
    // Before the implicit refs, so a list's whole is this chapter's: in
    // "v.1-2.4-5", "2.4-5" is no chapter 2.
    if (currentBook && currentChapter != null) {
      this.verseOnlyRe.lastIndex = 0
      for (const m of text.matchAll(this.verseOnlyRe)) {
        const gs = m.groups as { v1: string; v2?: string } | undefined
        if (!gs) continue

        const s = m.index ?? 0
        const e = s + m[0].length
        if (overlaps(s, e)) continue

        const verses = this.buildVerses(gs.v1, gs.v2) ?? []
        push({
          match: m[0] + this.takeVerseList(text, e, verses),
          index: s,
          book: currentBook.trim(),
          chapter: currentChapter,
          verses,
        })
      }
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
      // "(v.24.32)" is verses 24 and 32 of this chapter (pass 4), not chapter
      // 24 of the book cited before it.
      if (/\bv\.?\s*$/i.test(text.slice(0, s))) continue

      // Reuse the nearest explicit book in the same sentence before falling back
      // to the reader's current book context.
      const book = bookBefore(s) ?? currentBook?.trim()
      if (!book) continue // no context: skip

      const startChapter = Number(gs.chapter)

      if (gs.endCh && gs.endV) {
        // Cross-chapter
        const { num: sv, part: sp } = this.parseNumPart(gs.v1)
        const endChapter = Number(gs.endCh)
        const { num: ev, part, lastPart } = this.parseNumPart(gs.endV)
        const ep = lastPart ?? part
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
        // Same-chapter. Its verse list is taken here, or "15,2.4.6" would give
        // the next pass "4.6", chapter 4.
        const verses = this.buildVerses(gs.v1, gs.v2) ?? []
        push({
          match: m[0] + this.takeVerseList(text, e, verses),
          index: s,
          book,
          chapter: startChapter,
          verses,
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

    return out.sort((a, b) => a.index - b.index)
  }

  // ---- helpers --------------------------------------------------------------

  /**
   * More verses of a chapter, added to `verses`; returns the text they take.
   * After a comma, ", 12" or ", 12-14" ("Mt 5,3,4,5"); after a dot, the lists of
   * the notes ("Lc 6,2.7") and of liturgical leaflets ("Sl 94,1-2.6-7.8-9",
   * "Sl 78,1-2. 3-5"). The Índice's mark for a verse with a note may come
   * between them ("Mt 6,2 (n).5"). A range is taken whole or not at all: no
   * backing off "1-2" to "1".
   */
  private takeVerseList(
    text: string,
    from: number,
    verses: VerseReference[],
  ): string {
    const listRe =
      /^(?:\s*\(n\))?(?:\s*,\s*|\.(?<spaced>\s)?)(?<v1>\d+(?:[a-c]{1,2})?)(?:\s*[-\u2010-\u2015\u2212]\s*(?<v2>\d+(?:[a-c]{1,2})?)|(?!\s*[-\u2010-\u2015\u2212]))(?!\d)/
    // After a dot or a spaced comma, a number followed by ",5" or ":5" is a
    // new chapter ("Jo 3,16.4,5", "v.5, 6,1"); after a bare comma it is the
    // next verse ("Mt 5,3,4,5").
    const newChapterRe = /^[,:]\d/

    let taken = ""
    while (true) {
      const tail = text.slice(from + taken.length)
      const cm = listRe.exec(tail)
      if (!cm?.groups) break
      // A number that starts the next book's reference ("2 Cor 5,17").
      if (this.nextBookRe?.test(tail)) break
      const sep = cm[0].replace("(n)", "").trimStart()
      const looseSep = sep.startsWith(".") || /^,\s/.test(sep)
      if (looseSep && newChapterRe.test(tail.slice(cm[0].length))) break

      const nextVerses = this.buildVerses(cm.groups["v1"], cm.groups["v2"])
      if (!nextVerses) break
      verses.push(...nextVerses)
      taken += cm[0]
    }
    return taken
  }

  /**
   * "16" or "16b"; "16bc" (parts b to c) starts at its first part and ends at
   * its last, `lastPart`.
   */
  private parseNumPart(s: string): {
    num: number
    part?: VersePart
    lastPart?: VersePart
  } {
    const m = /^(\d+)([a-c]{1,2})?$/i.exec(s.trim())
    if (!m) return { num: Number(s) }
    const parts = (m[2] ?? "").toLowerCase()
    return {
      num: Number(m[1]),
      ...(parts ? { part: parts[0] as VersePart } : {}),
      ...(parts.length > 1 ? { lastPart: parts[1] as VersePart } : {}),
    }
  }

  private buildVerses(v1?: string, v2?: string): VerseReference[] | undefined {
    if (!v1) return undefined
    const a = this.parseNumPart(v1)
    if (!v2 && a.lastPart) {
      return [
        {
          type: "range",
          start: a.num,
          startPart: a.part,
          end: a.num,
          endPart: a.lastPart,
        },
      ]
    }
    if (!v2) {
      return [
        { type: "single", verse: a.num, ...(a.part ? { part: a.part } : {}) },
      ]
    }
    const b = this.parseNumPart(v2)

    // Normalize reversed user input such as "20b-18a" into an increasing range
    // so downstream consumers can treat every range uniformly. The part
    // suffixes travel with their verse number when the bounds swap.
    // Compare the suffix when both bounds land on the same verse, so "20b-20a"
    // normalises like "20a-20b" instead of staying descending.
    const isReversed =
      a.num > b.num || (a.num === b.num && (a.part ?? "") > (b.part ?? ""))
    const startRef = isReversed ? b : a
    const endRef = isReversed ? a : b

    const range: Extract<VerseReference, { type: "range" }> = {
      type: "range",
      start: startRef.num,
      end: endRef.num,
    }

    if (startRef.part) range.startPart = startRef.part
    const endPart = endRef.lastPart ?? endRef.part
    if (endPart) range.endPart = endPart

    return [range]
  }
}
