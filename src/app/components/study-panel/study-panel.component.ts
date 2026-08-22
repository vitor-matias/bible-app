import { CommonModule } from "@angular/common"
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  DestroyRef,
  ElementRef,
  EventEmitter,
  Input,
  inject,
  type OnChanges,
  Output,
  type SimpleChanges,
} from "@angular/core"
import { takeUntilDestroyed } from "@angular/core/rxjs-interop"
import { MatIconModule } from "@angular/material/icon"
import { MatTooltipModule } from "@angular/material/tooltip"
import { RouterModule } from "@angular/router"
import { debounceTime, Subject, type Subscription } from "rxjs"
import { BibleApiService } from "../../services/bible-api.service"
import {
  type BibleReference,
  BibleReferenceService,
} from "../../services/bible-reference.service"
import { BookService } from "../../services/book.service"
import { NotesService, type VerseNote } from "../../services/notes.service"
import { getVerseQueryParams, parseReferences } from "../verse/verse.utils"

export type PanelTab = "references" | "footnotes" | "notes"

/** A cross reference as the panel shows it: where it points, and what it says. */
type ReferenceEntry = {
  /** Stable identity for tracking, since one chapter can cite a passage twice. */
  key: string
  label: string
  bookId: Book["id"]
  chapterNumber: Chapter["number"]
  verseStart?: Verse["number"]
  verseEnd?: Verse["number"]
  link: (string | number)[]
  queryParams: Record<string, number> | null
  /** The opening verses of the passage, once fetched. */
  verses: { number: Verse["number"]; text: string }[]
  /** Whether the passage runs on past the verses quoted here. */
  truncated?: boolean
  failed?: boolean
}

/**
 * How many verses of a cited passage the panel quotes. Enough to recognise
 * the passage and read the thought it opens with; past that it is no longer
 * an aside but a second chapter competing with the one being read, so the
 * link takes over.
 */
const MAX_QUOTED_VERSES = 3

/**
 * The references printed on one verse. This edition prints them at the head of
 * each passage, so a group is in practice a passage's parallels, labelled by
 * the verse that carries them.
 */
type ReferenceGroup = {
  verseNumber: Verse["number"]
  label: string
  entries: ReferenceEntry[]
  /**
   * The last verse of the passage these references cover. The edition prints
   * them once, on one verse, but they describe the whole passage — so the
   * group stays marked for any verse in it, not only the one carrying them.
   */
  lastVerse: Verse["number"]
}

/** A footnote plus the verse it hangs off, for the chapter-wide listing. */
type FootnoteEntry = {
  verseNumber: Verse["number"]
  label: string
  footnote: _Footnote
}

/** How long the note box waits after the last keystroke before saving. */
const NOTE_SAVE_DEBOUNCE_MS = 500

/**
 * Study mode's right-hand apparatus: what the edition says about the chapter
 * in front of the reader.
 *
 * References and footnotes are listed for the whole chapter rather than for
 * the selected verse alone — that is how a printed study edition sets them,
 * and it means the column has something to say before the reader has picked
 * anything. Selecting a verse marks its entries and scrolls them into view
 * instead of filtering the list down to them. Only the note box is
 * verse-bound, because a note is written about one verse.
 */
@Component({
  selector: "study-panel",
  standalone: true,
  imports: [CommonModule, RouterModule, MatIconModule, MatTooltipModule],
  templateUrl: "./study-panel.component.html",
  styleUrl: "./study-panel.component.css",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StudyPanelComponent implements OnChanges {
  @Input() book?: Book
  @Input() chapter: Chapter | null = null
  /**
   * The current selection, as an object rather than a bare Verse: clicking the
   * same verse's footnote marker after clicking its text has to reach the
   * panel as a new event, and it carries which tab that click asked for.
   */
  @Input() selection: VerseSelection | null = null
  /** Folded away to a strip, leaving the reading column the width. */
  @Input() collapsed = false

  @Output() toggleCollapsed = new EventEmitter<void>()

  activeTab: PanelTab = "references"
  referenceGroups: ReferenceGroup[] = []
  footnotes: FootnoteEntry[] = []
  chapterNotes: VerseNote[] = []
  noteDraft = ""

  readonly tabs: { id: PanelTab; label: string }[] = [
    { id: "references", label: "Referências" },
    { id: "footnotes", label: "Notas de rodapé" },
    { id: "notes", label: "As minhas notas" },
  ]

  private readonly bibleRef = inject(BibleReferenceService)
  private readonly api = inject(BibleApiService)
  private readonly bookService = inject(BookService)
  private readonly notesService = inject(NotesService)
  private readonly cdr = inject(ChangeDetectorRef)
  private readonly destroyRef = inject(DestroyRef)
  private readonly host: ElementRef<HTMLElement> = inject(ElementRef)

  private referenceRequests: Subscription[] = []
  private notesSubscription?: Subscription
  /**
   * Queued note saves carry the verse they were typed for. The reader can
   * select another verse inside the debounce window, and resolving the
   * target when the save fires would file the note under whichever verse
   * happened to be selected by then.
   */
  private readonly noteInput = new Subject<{ target: Verse; text: string }>()

  constructor() {
    this.noteInput
      .pipe(debounceTime(NOTE_SAVE_DEBOUNCE_MS), takeUntilDestroyed())
      .subscribe(({ target, text }) => this.persistNote(target, text))
    // Registered once, not per chapter: onDestroy callbacks accumulate, and
    // the reader changes chapter far more often than it destroys the panel.
    this.destroyRef.onDestroy(() => {
      this.notesSubscription?.unsubscribe()
      this.cancelReferenceRequests()
    })
  }

  get selectedVerse(): Verse | undefined {
    return this.selection?.verse
  }

  /** "22,39" — how this edition writes a reference to the selected verse. */
  get selectedVerseLabel(): string {
    const verse = this.selectedVerse
    if (!verse) return ""
    return this.verseLabel(verse.number)
  }

  ngOnChanges(changes: SimpleChanges): void {
    // The chapter's apparatus is what the two listings show, so they are built
    // once per chapter — selecting a verse only marks entries already on
    // screen, and costs no further requests.
    if (changes["book"] || changes["chapter"]) {
      this.buildReferences()
      this.buildFootnotes()
      this.watchChapterNotes()
    }
    if (changes["selection"]) {
      // A click on the footnote marker asks for the footnotes; any other click
      // leaves the reader on the tab they were already reading.
      const requested = this.selection?.panel
      if (requested) this.activeTab = requested
      this.loadNoteDraft()
      this.scrollSelectionIntoView()
    }
  }

  selectTab(tab: PanelTab): void {
    this.activeTab = tab
  }

  /**
   * The keyboard half of the tablist contract: the strip is one tab stop
   * (roving tabindex), and the arrows move between tabs within it. Without
   * this a keyboard reader can reach the tabs but never leave the first one.
   */
  onTabKeydown(event: KeyboardEvent, index: number): void {
    const last = this.tabs.length - 1
    let next: number
    switch (event.key) {
      case "ArrowRight":
        next = index === last ? 0 : index + 1
        break
      case "ArrowLeft":
        next = index === 0 ? last : index - 1
        break
      case "Home":
        next = 0
        break
      case "End":
        next = last
        break
      default:
        return
    }
    event.preventDefault()
    this.selectTab(this.tabs[next].id)
    // Selection follows focus, so the newly selected tab has to take it.
    const strip = this.host.nativeElement.querySelectorAll<HTMLElement>(".tab")
    strip[next]?.focus()
  }

  onNoteInput(value: string): void {
    this.noteDraft = value
    const target = this.selectedVerse
    if (target) this.noteInput.next({ target, text: value })
  }

  /** Leaving the box saves immediately rather than waiting out the debounce. */
  onNoteBlur(): void {
    const target = this.selectedVerse
    if (target) this.persistNote(target, this.noteDraft)
  }

  /** True for the entries belonging to the verse the reader has selected. */
  isCurrent(verseNumber: Verse["number"]): boolean {
    return this.selectedVerse?.number === verseNumber
  }

  /** True while the reader is anywhere inside the passage this group covers. */
  isCurrentGroup(group: ReferenceGroup): boolean {
    const selected = this.selectedVerse?.number
    if (selected === undefined) return false
    return selected >= group.verseNumber && selected <= group.lastVerse
  }

  verseLabel(verseNumber: Verse["number"]): string {
    // Verse 0 is the chapter's front matter, where this edition prints the
    // parallels for a passage that opens the chapter. They belong to its
    // first verse as far as a reader is concerned, and "22,0" is not a
    // reference anyone writes.
    const number = verseNumber > 0 ? verseNumber : 1
    return `${this.chapter?.number ?? ""},${number}`
  }

  noteLabel(note: VerseNote): string {
    return `${note.chapter},${note.verse}`
  }

  parseFootnote(footnote: _Footnote): (string | BibleReference)[] {
    return parseReferences(
      this.bibleRef,
      footnote.text,
      this.book?.id ?? "",
      this.chapter?.number,
    )
  }

  /** Where a reference inside a footnote points. */
  footnoteLink(reference: BibleReference): (string | number)[] {
    const target = this.bookService.findBook(reference.book)
    return ["/", this.bookService.getUrlAbrv(target), reference.chapter]
  }

  footnoteQueryParams(reference: BibleReference) {
    return getVerseQueryParams(reference.verses, reference.crossChapter)
  }

  isReference(part: string | BibleReference): part is BibleReference {
    return typeof part === "object"
  }

  private persistNote(verse: Verse, text: string): void {
    if (!this.book) return
    this.notesService.saveNote(
      this.book.id,
      verse.chapterNumber,
      verse.number,
      text,
    )
  }

  private loadNoteDraft(): void {
    const verse = this.selectedVerse
    if (!verse || !this.book) {
      this.noteDraft = ""
      return
    }
    this.noteDraft =
      this.notesService.getNote(this.book.id, verse.chapterNumber, verse.number)
        ?.text ?? ""
  }

  /**
   * Brings the selected verse's entries into view, so picking a verse in a
   * long chapter does not leave the reader hunting down the column for it.
   * The panel scrolls, not the page: scrollIntoView would drag the text
   * column along with it.
   */
  private scrollSelectionIntoView(): void {
    const verse = this.selectedVerse
    if (!verse || typeof requestAnimationFrame === "undefined") return
    // References are keyed by the verse that carries them, which for a verse
    // in the middle of a passage is an earlier one — scroll to the group
    // covering the reader, not to a verse the panel never lists.
    const covering = this.referenceGroups.find((group) =>
      this.isCurrentGroup(group),
    )
    const anchor =
      this.activeTab === "references" && covering
        ? covering.verseNumber
        : verse.number
    requestAnimationFrame(() => {
      const element: HTMLElement | null = this.host.nativeElement.querySelector(
        `[data-verse="${anchor}"]`,
      )
      const body = element?.closest(".tab-body") as HTMLElement | null
      if (!element || !body) return
      body.scrollTo({
        top: element.offsetTop - body.offsetTop - 12,
        behavior: "smooth",
      })
    })
  }

  private watchChapterNotes(): void {
    this.notesSubscription?.unsubscribe()
    if (!this.book || !this.chapter) {
      this.chapterNotes = []
      return
    }
    this.notesSubscription = this.notesService
      .notesForChapter(this.book.id, this.chapter.number)
      .subscribe((notes) => {
        this.chapterNotes = notes
        this.cdr.markForCheck()
      })
  }

  /** Every footnote in the chapter, in the order the text prints them. */
  private buildFootnotes(): void {
    this.footnotes = (this.chapter?.verses ?? []).flatMap((verse) =>
      verse.text
        .filter((part): part is _Footnote => part.type === "footnote")
        .map((footnote) => ({
          verseNumber: verse.number,
          label: this.verseLabel(verse.number),
          footnote,
        })),
    )
  }

  /** Every cross reference in the chapter, grouped by the verse printing it. */
  private buildReferences(): void {
    this.cancelReferenceRequests()
    this.referenceGroups = []
    if (!this.chapter) return

    const verses = this.chapter.verses ?? []
    // Where each passage ends: the verse before the next heading, since a
    // heading is what starts the next passage.
    const sectionStarts = verses
      .filter((verse) => verse.text.some((part) => part.type === "section"))
      .map((verse) => verse.number)
    const lastVerseNumber = verses.length
      ? Math.max(...verses.map((verse) => verse.number))
      : 0

    const groups: ReferenceGroup[] = []
    for (const verse of verses) {
      const entries = this.entriesFor(verse)
      if (!entries.length) continue
      const nextStart = sectionStarts.find((start) => start > verse.number)
      groups.push({
        verseNumber: verse.number,
        label: this.verseLabel(verse.number),
        entries,
        lastVerse: nextStart === undefined ? lastVerseNumber : nextStart - 1,
      })
    }

    this.referenceGroups = groups
    this.fetchReferenceTexts(groups)
  }

  /** Cross references printed on one verse, each passage listed once. */
  private entriesFor(verse: Verse): ReferenceEntry[] {
    const seen = new Set<string>()
    const entries: ReferenceEntry[] = []
    for (const part of verse.text) {
      if (part.type !== "references") continue
      for (const reference of this.bibleRef.extract(
        part.text,
        verse.bookId,
        verse.chapterNumber,
      )) {
        const entry = this.toEntry(reference)
        // The same passage can be cited twice on one verse (two references
        // blocks either side of a quote); list it once.
        if (seen.has(entry.key)) continue
        seen.add(entry.key)
        entries.push(entry)
      }
    }
    return entries
  }

  private toEntry(reference: BibleReference): ReferenceEntry {
    const target = this.bookService.findBook(reference.book)
    const params = getVerseQueryParams(reference.verses, reference.crossChapter)
    const verseLabel = params?.verseEnd
      ? `${params.verseStart}-${params.verseEnd}`
      : params?.verseStart
    return {
      verses: [],
      key: `${target.id}:${reference.chapter}:${verseLabel ?? ""}`,
      // shortName, not name: the panel is a narrow column, and "Evangelho de
      // São Marcos 12,28-34" wraps to three lines where "Marcos" does not.
      label: verseLabel
        ? `${target.shortName} ${reference.chapter},${verseLabel}`
        : `${target.shortName} ${reference.chapter}`,
      bookId: target.id,
      chapterNumber: reference.chapter,
      verseStart: params?.verseStart,
      verseEnd: params?.verseEnd,
      link: ["/", this.bookService.getUrlAbrv(target), reference.chapter],
      queryParams: params,
    }
  }

  /**
   * Fills in the opening verses each reference points at, so the reader can
   * weigh a parallel without leaving the chapter. At most MAX_QUOTED_VERSES
   * of a range, with the rest left to the link, which every reference carries
   * whether or not its text could be fetched.
   *
   * Fetched a chapter at a time rather than a verse at a time. A chapter's
   * references cluster into far fewer chapters than verses (the synoptic
   * parallels of one passage often share one), the chapter request is
   * deduplicated and cached by BibleApiService, and it is the same request the
   * reader makes anyway if they follow the link.
   */
  private fetchReferenceTexts(groups: ReferenceGroup[]): void {
    const byChapter = new Map<string, ReferenceEntry[]>()
    for (const group of groups) {
      for (const entry of group.entries) {
        if (!entry.verseStart) continue
        const key = `${entry.bookId}:${entry.chapterNumber}`
        const pending = byChapter.get(key)
        if (pending) {
          pending.push(entry)
        } else {
          byChapter.set(key, [entry])
        }
      }
    }

    for (const entries of byChapter.values()) {
      const { bookId, chapterNumber } = entries[0]
      this.referenceRequests.push(
        this.api.getChapter(bookId, chapterNumber).subscribe({
          next: (chapter) => {
            for (const entry of entries) {
              StudyPanelComponent.fill(entry, chapter)
            }
            this.cdr.markForCheck()
          },
          // Offline, or a reference the API cannot resolve: the entries stay
          // links, which is still the useful half of them.
          error: () => {
            for (const entry of entries) entry.failed = true
            this.cdr.markForCheck()
          },
        }),
      )
    }
  }

  private cancelReferenceRequests(): void {
    for (const request of this.referenceRequests) request.unsubscribe()
    this.referenceRequests = []
  }

  /** Quotes the passage's opening verses onto the entry. */
  private static fill(entry: ReferenceEntry, chapter: Chapter): void {
    const start = entry.verseStart
    if (!start) return
    // A reference with no end verse cites a single verse.
    const end = entry.verseEnd ?? start
    const wanted = (chapter.verses ?? []).filter(
      (verse) => verse.number >= start && verse.number <= end,
    )
    if (!wanted.length) {
      entry.failed = true
      return
    }
    entry.verses = wanted.slice(0, MAX_QUOTED_VERSES).map((verse) => ({
      number: verse.number,
      text: StudyPanelComponent.plainText(verse),
    }))
    entry.truncated = wanted.length > MAX_QUOTED_VERSES
  }

  /** The readable words of a verse, without its apparatus or headings. */
  private static plainText(verse: Verse): string {
    return (verse.text ?? [])
      .filter(
        (part) =>
          part.type === "text" ||
          part.type === "quote" ||
          part.type === "paragraph",
      )
      .map((part) => part.text.trim())
      .filter(Boolean)
      .join(" ")
  }
}
