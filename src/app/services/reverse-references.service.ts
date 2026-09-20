import { Injectable, inject } from "@angular/core"
import { BehaviorSubject, type Observable } from "rxjs"
import { placeReferences } from "../utils/chapter-references"
import {
  type BibleReference,
  BibleReferenceService,
} from "./bible-reference.service"
import { BookService } from "./book.service"
import { OfflineDataService } from "./offline-data.service"

/** A passage that cites the verse being read. */
export type IncomingReference = {
  /** Identity, so the same citation is never listed twice. */
  key: string
  label: string
  link: (string | number)[]
  queryParams: Record<string, number> | null
  /** The span of the target this citation covers, for matching a verse. */
  fromVerse: Verse["number"]
  toVerse: Verse["number"]
}

export type IndexState = "idle" | "building" | "ready" | "unavailable"

/**
 * Which passages cite a given verse — the other half of cross-reference
 * study, and the half the edition does not print. It prints what a passage
 * points to; it cannot print what points back without listing the whole Bible
 * under every verse.
 *
 * Answering it needs the entire corpus, so the index is built from the
 * offline cache rather than the network, and only when the reader asks for
 * it. The cache is filled automatically for installed apps; everywhere else
 * this reports "unavailable" rather than quietly downloading a Bible.
 *
 * Built once and held in memory: it is derived data, and rebuilding it costs
 * a pass over the corpus rather than a request.
 */
@Injectable({ providedIn: "root" })
export class ReverseReferencesService {
  private readonly bibleRef = inject(BibleReferenceService)
  private readonly bookService = inject(BookService)
  private readonly offlineData = inject(OfflineDataService)

  /** Keyed by `bookId:chapter`, since a citation names a chapter and a span. */
  private index: Map<string, IncomingReference[]> | null = null
  private building?: Promise<void>
  private readonly stateSubject = new BehaviorSubject<IndexState>("idle")
  readonly state$: Observable<IndexState> = this.stateSubject.asObservable()

  get state(): IndexState {
    return this.stateSubject.value
  }

  /**
   * Builds the index if it is not built, using whatever the offline cache
   * holds. Safe to call repeatedly: concurrent callers share one build.
   */
  async ensureIndex(): Promise<void> {
    if (this.index) return
    if (this.building) return this.building

    this.stateSubject.next("building")
    this.building = this.build().finally(() => {
      this.building = undefined
    })
    return this.building
  }

  /** The citations pointing at one verse, or [] while there is no index. */
  incomingFor(
    bookId: Book["id"],
    chapter: Chapter["number"],
    verse: Verse["number"],
  ): IncomingReference[] {
    const candidates = this.index?.get(`${bookId}:${chapter}`) ?? []
    return candidates.filter(
      (entry) => verse >= entry.fromVerse && verse <= entry.toVerse,
    )
  }

  private async build(): Promise<void> {
    const books = await this.offlineData.getCachedBooksAsync()
    const hasCorpus = books.some((book) =>
      book.chapters?.some((chapter) => chapter.verses?.length),
    )
    if (!hasCorpus) {
      // Nothing to index. The reader is not offline-enabled, so the honest
      // answer is that this cannot be shown, not an empty result that reads
      // as "nothing cites this verse".
      this.stateSubject.next("unavailable")
      return
    }

    const index = new Map<string, IncomingReference[]>()
    const seen = new Set<string>()

    for (const book of books) {
      for (const chapter of book.chapters ?? []) {
        // Placed, not read off the verse that stores them: a heading's
        // references sit in the payload of the verse before the passage, or
        // in verse 0, and citing that gave "Mateus 5,0" and the last verse of
        // the passage before the one doing the citing.
        for (const placed of placeReferences(chapter.verses ?? [])) {
          const extracted = this.bibleRef.extract(
            placed.part.text,
            book.id,
            chapter.number,
          )
          for (const [position, reference] of extracted.entries()) {
            // A division's heading opens with the range it covers —
            // "(1,1-2,23; ver Lc 1,5-2,52)". That is the division's extent,
            // not a citation: indexed, every verse of Matthew 1-2 was cited
            // by Matthew 1 itself.
            if (
              placed.underMajorHeading &&
              position === 0 &&
              this.bookService.findBook(reference.book).id === book.id
            ) {
              continue
            }
            // A heading's references speak for the passage it opens; a
            // block in the run of a verse, for that verse.
            const citedFrom =
              placed.underHeading || placed.verse.number < 1
                ? placed.startsAt
                : placed.verse.number
            this.add(index, seen, book, chapter, citedFrom, reference)
          }
        }
      }
    }

    this.index = index
    this.stateSubject.next("ready")
  }

  private add(
    index: Map<string, IncomingReference[]>,
    seen: Set<string>,
    book: Book,
    chapter: Chapter,
    /** The verse the citing passage starts at. */
    citedFrom: Verse["number"],
    reference: BibleReference,
  ): void {
    const target = this.bookService.findBook(reference.book)
    // findBook falls back to the About page for anything it cannot resolve;
    // a citation of that is a parse artefact, not a passage.
    if (target.id === "about") return

    const source = `${book.id}:${chapter.number}:${citedFrom}`

    // A citation covers what it names, which is not always verses in one
    // chapter: "Mc 12" is a whole chapter, "Jb 38-39" a run of them, and
    // "Lc 1,5-2,52" runs out of the chapter it starts in. Indexed span by
    // span, so the citation is found from whichever verse the reader picks.
    for (const span of ReverseReferencesService.spansFor(reference)) {
      const targetKey = `${target.id}:${span.chapter}`
      const key = `${source}->${targetKey}:${span.from}-${span.to}`
      // The same passage cites the same target once, however many references
      // blocks it prints either side of a quote.
      if (seen.has(key)) continue
      seen.add(key)

      const entry: IncomingReference = {
        key,
        label: `${book.shortName} ${chapter.number},${citedFrom}`,
        link: [
          "/",
          this.bookService.getUrlAbrv(book),
          this.bookService.getChapterUrlSegment(chapter.number),
        ],
        queryParams: { verseStart: citedFrom },
        fromVerse: span.from,
        toVerse: span.to,
      }

      const existing = index.get(targetKey)
      if (existing) {
        existing.push(entry)
      } else {
        index.set(targetKey, [entry])
      }
    }
  }

  /**
   * The chapters a reference covers, and how much of each.
   *
   * A reference that names no verse covers its chapter entire; a run of whole
   * chapters covers each of them; a range that crosses a chapter boundary
   * covers the rest of the one it opens, all of any in between, and the start
   * of the one it closes in.
   */
  private static spansFor(
    reference: BibleReference,
  ): { chapter: Chapter["number"]; from: number; to: number }[] {
    const spans: { chapter: Chapter["number"]; from: number; to: number }[] = []
    const cross = reference.crossChapter
    if (cross) {
      const last = Math.min(cross.endChapter, cross.startChapter + MAX_SPAN)
      for (let chapter = cross.startChapter; chapter <= last; chapter++) {
        spans.push({
          chapter,
          from: chapter === cross.startChapter ? cross.startVerse : 1,
          to: chapter === cross.endChapter ? cross.endVerse : WHOLE_CHAPTER,
        })
      }
      return spans
    }

    if (reference.endChapter && reference.endChapter > reference.chapter) {
      const last = Math.min(reference.endChapter, reference.chapter + MAX_SPAN)
      for (let chapter = reference.chapter; chapter <= last; chapter++) {
        spans.push({ chapter, from: 1, to: WHOLE_CHAPTER })
      }
      return spans
    }

    // A list of verses in one chapter — "Mc 12,1.5-7" — covers each of them,
    // not just the first. (getVerseQueryParams answers where to *open* a
    // citation, which is its first verse, and says nothing of the rest.)
    const verses = reference.verses ?? []
    if (!verses.length) {
      return [{ chapter: reference.chapter, from: 1, to: WHOLE_CHAPTER }]
    }
    return verses.map((entry) =>
      entry.type === "range"
        ? { chapter: reference.chapter, from: entry.start, to: entry.end }
        : { chapter: reference.chapter, from: entry.verse, to: entry.verse },
    )
  }
}

/** Stands for "to the end of the chapter", whatever its last verse is. */
const WHOLE_CHAPTER = Number.MAX_SAFE_INTEGER

/** A guard against a mis-parsed range indexing the whole Bible. */
const MAX_SPAN = 150
