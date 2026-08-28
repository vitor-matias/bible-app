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
import {
  HIGHLIGHT_COLORS,
  type HighlightColor,
  HighlightService,
} from "../../services/highlight.service"
import { NotesService, type VerseNote } from "../../services/notes.service"
import {
  type IncomingReference,
  type IndexState,
  ReverseReferencesService,
} from "../../services/reverse-references.service"
import { formatPassage } from "../../utils/text"
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
  footnote: _Footnote
}

/** How long the note box waits after the last keystroke before saving. */
const NOTE_SAVE_DEBOUNCE_MS = 500

/** The same, for the note search — short enough to feel like it types. */
const NOTE_SEARCH_DEBOUNCE_MS = 200

/** How long the copy button confirms itself before going back to normal. */
const COPIED_FEEDBACK_MS = 1600

/** Breathing room kept between a followed entry and the panel's edges. */
const SCROLL_MARGIN = 16

/**
 * How the follow-along scroll is paced. Time per pixel travelled, bounded at
 * both ends: short moves must not crawl, long ones must not blur past.
 */
const SCROLL_MS_PER_PIXEL = 0.7
const MIN_SCROLL_MS = 260
const MAX_SCROLL_MS = 700

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
  /**
   * The verse at the top of the reading column. The panel follows it so the
   * apparatus on screen belongs to the passage on screen, without treating
   * scrolling past a verse as choosing it — an explicit selection always
   * wins over where the reader happens to have scrolled.
   */
  @Input() visibleVerse?: Verse["number"]
  /** Folded away to a strip, leaving the reading column the width. */
  @Input() collapsed = false

  @Output() toggleCollapsed = new EventEmitter<void>()

  activeTab: PanelTab = "references"
  referenceGroups: ReferenceGroup[] = []
  footnotes: FootnoteEntry[] = []
  chapterNotes: VerseNote[] = []
  noteMatches: VerseNote[] = []
  noteQuery = ""
  noteDraft = ""
  /** Set for a moment after a copy, so the button can say it worked. */
  copied = false
  readonly highlightColors = HIGHLIGHT_COLORS
  /** Passages that cite the selected verse, once the reader asks for them. */
  incoming: IncomingReference[] = []
  incomingState: IndexState = "idle"
  /** The colour on the selected verse, if the reader has marked it. */
  selectedHighlight?: HighlightColor

  readonly tabs: { id: PanelTab; label: string }[] = [
    { id: "references", label: "Referências" },
    { id: "footnotes", label: "Notas de rodapé" },
    { id: "notes", label: "As minhas notas" },
  ]

  private readonly bibleRef = inject(BibleReferenceService)
  private readonly api = inject(BibleApiService)
  private readonly bookService = inject(BookService)
  private readonly notesService = inject(NotesService)
  private readonly highlights = inject(HighlightService)
  private readonly reverseRefs = inject(ReverseReferencesService)
  private readonly cdr = inject(ChangeDetectorRef)
  private readonly destroyRef = inject(DestroyRef)
  private readonly host: ElementRef<HTMLElement> = inject(ElementRef)

  /** The entry the panel last scrolled to, so it does not scroll there again. */
  private scrolledAnchor?: Verse["number"]
  private scrollFrame?: number
  private referenceRequests: Subscription[] = []
  private notesSubscription?: Subscription
  /**
   * Queued note saves carry the verse they were typed for. The reader can
   * select another verse inside the debounce window, and resolving the
   * target when the save fires would file the note under whichever verse
   * happened to be selected by then.
   */
  private readonly noteInput = new Subject<{ target: Verse; text: string }>()
  private readonly noteSearch = new Subject<string>()
  private noteSearchSubscription?: Subscription
  private copiedTimer?: ReturnType<typeof setTimeout>

  constructor() {
    this.noteInput
      .pipe(debounceTime(NOTE_SAVE_DEBOUNCE_MS), takeUntilDestroyed())
      .subscribe(({ target, text }) => this.persistNote(target, text))
    // Registered once, not per chapter: onDestroy callbacks accumulate, and
    // the reader changes chapter far more often than it destroys the panel.
    this.noteSearch
      .pipe(debounceTime(NOTE_SEARCH_DEBOUNCE_MS), takeUntilDestroyed())
      .subscribe((query) => this.runNoteSearch(query))

    this.destroyRef.onDestroy(() => {
      this.notesSubscription?.unsubscribe()
      this.noteSearchSubscription?.unsubscribe()
      if (this.scrollFrame !== undefined) cancelAnimationFrame(this.scrollFrame)
      if (this.copiedTimer) clearTimeout(this.copiedTimer)
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
      this.loadSelectedHighlight()
      this.loadIncoming()
      this.scrollActiveIntoView()
    }
    if (changes["visibleVerse"] && !this.selection) {
      this.scrollActiveIntoView()
    }
  }

  selectTab(tab: PanelTab): void {
    if (tab === this.activeTab) return
    this.activeTab = tab
    // The new tab has its own list, which has never been placed.
    this.scrolledAnchor = undefined
    // Rendered here rather than left to the next change detection pass.
    // Angular coalesces those onto an animation frame, and a plain button is
    // the whole interaction — nothing else follows it to flush the queue, so
    // the strip could sit on the old tab until an unrelated event (hovering
    // a toolbar button, say) happened to trigger a pass. Every other control
    // in this app is a Material one, which renders itself and hides that.
    this.cdr.detectChanges()
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

  /** The verse the panel is following: the chosen one, else the one on screen. */
  get activeVerse(): Verse["number"] | undefined {
    return this.selectedVerse?.number ?? this.visibleVerse
  }

  /**
   * Marking answers "is this the verse you chose", not "is this what happens
   * to be on screen". Scrolling still carries the panel along to the right
   * passage, but it marks nothing: a mark that moved by itself as the page
   * went past would be reporting the scroll position rather than a choice.
   */
  isCurrent(verseNumber: Verse["number"]): boolean {
    return this.selectedVerse?.number === verseNumber
  }

  /** True for the passage holding the verse the reader chose. */
  isCurrentGroup(group: ReferenceGroup): boolean {
    const selected = this.selectedVerse?.number
    if (selected === undefined) return false
    return this.groupCovering(selected) === group
  }

  /** The passage a verse falls in, whether the reader chose it or scrolled to it. */
  private groupCovering(
    verseNumber: Verse["number"],
  ): ReferenceGroup | undefined {
    return this.referenceGroups.find(
      (group) =>
        verseNumber >= group.verseNumber && verseNumber <= group.lastVerse,
    )
  }

  verseLabel(verseNumber: Verse["number"]): string {
    const chapter = this.chapter?.number ?? ""
    // Verse 0 is the chapter's front matter, where this edition prints the
    // heading and the parallels for the passage that opens the chapter.
    // Those cover the chapter, not its first verse — and "1,0" is not a
    // reference anyone writes — so they are named by the chapter alone.
    return verseNumber > 0 ? `${chapter},${verseNumber}` : `Capítulo ${chapter}`
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

  /**
   * Builds the reverse index and shows what cites this verse. Asked for
   * explicitly: the answer needs the whole corpus, and a reader who has not
   * downloaded it should not have a Bible fetched under them for a panel
   * section they did not open.
   */
  async showIncoming(): Promise<void> {
    this.incomingState = "building"
    this.cdr.detectChanges()
    await this.reverseRefs.ensureIndex()
    this.incomingState = this.reverseRefs.state
    this.loadIncoming()
    this.cdr.detectChanges()
  }

  private loadIncoming(): void {
    const verse = this.selectedVerse
    this.incomingState = this.reverseRefs.state
    this.incoming =
      verse && this.book && this.reverseRefs.state === "ready"
        ? this.reverseRefs.incomingFor(
            this.book.id,
            verse.chapterNumber,
            verse.number,
          )
        : []
  }

  /** Marks the selected verse, or takes the mark off if it is the same one. */
  toggleHighlight(color: HighlightColor): void {
    const verse = this.selectedVerse
    if (!verse || !this.book) return
    this.highlights.toggle(
      this.book.id,
      verse.chapterNumber,
      verse.number,
      color,
    )
    this.loadSelectedHighlight()
    this.cdr.detectChanges()
  }

  private loadSelectedHighlight(): void {
    const verse = this.selectedVerse
    this.selectedHighlight =
      verse && this.book
        ? this.highlights.colorFor(
            this.book.id,
            verse.chapterNumber,
            verse.number,
          )
        : undefined
  }

  onNoteQuery(query: string): void {
    this.noteQuery = query
    this.noteSearch.next(query)
  }

  private runNoteSearch(query: string): void {
    this.noteSearchSubscription?.unsubscribe()
    this.noteSearchSubscription = this.notesService
      .search(query)
      .subscribe((matches) => {
        this.noteMatches = matches
        this.cdr.markForCheck()
      })
  }

  /** Where a note's own verse lives, so a search result can be opened. */
  noteLink(note: VerseNote): (string | number)[] {
    const book = this.bookService.findBook(note.bookId)
    return [
      "/",
      this.bookService.getUrlAbrv(book),
      this.bookService.getChapterUrlSegment(note.chapter),
    ]
  }

  noteQueryParams(note: VerseNote): Record<string, number> {
    return { verseStart: note.verse }
  }

  /** "Mateus 22,37" — how a note in another book is named in the results. */
  noteReference(note: VerseNote): string {
    const book = this.bookService.findBook(note.bookId)
    return `${book.shortName} ${note.chapter},${note.verse}`
  }

  /**
   * Puts the verse on the clipboard the way it would be quoted: the words,
   * then the reference. Study means quoting, and retyping a reference by hand
   * is where the wrong one comes from.
   */
  async copySelectedVerse(): Promise<void> {
    const verse = this.selectedVerse
    if (!verse || !this.book) return

    const text = StudyPanelComponent.plainText(verse)
    const reference = `${this.book.shortName} ${this.selectedVerseLabel}`
    try {
      await navigator.clipboard.writeText(formatPassage(text, reference))
      this.copied = true
      this.cdr.markForCheck()
      if (this.copiedTimer) clearTimeout(this.copiedTimer)
      this.copiedTimer = setTimeout(() => {
        this.copied = false
        this.cdr.markForCheck()
      }, COPIED_FEEDBACK_MS)
    } catch {
      // Clipboard permission refused, or no clipboard at all: the verse is
      // still on screen to select by hand, so say nothing rather than throw
      // an error message over the text.
    }
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
   * Brings the followed verse's entries into view, so neither picking a verse
   * nor scrolling past one leaves the reader hunting down the column for it.
   * The panel scrolls, not the page: scrollIntoView would drag the text
   * column along with it.
   */
  private scrollActiveIntoView(): void {
    const active = this.activeVerse
    if (active === undefined || typeof requestAnimationFrame === "undefined")
      return
    // References are keyed by the verse that carries them, which for a verse
    // in the middle of a passage is an earlier one — scroll to the group
    // covering the reader, not to a verse the panel never lists. Follows the
    // scroll as well as a selection, which is why it asks groupCovering
    // rather than what is marked.
    const covering = this.groupCovering(active)
    const anchor =
      this.activeTab === "references" && covering
        ? covering.verseNumber
        : this.nearestAnchorAt(active)
    if (anchor === undefined) return
    // Every verse scrolled past reports a change, but most of them sit in the
    // passage already on screen. Scrolling only when the entry actually
    // changes is what keeps this from re-issuing a scroll on every verse and
    // stuttering the panel.
    if (anchor === this.scrolledAnchor) return
    this.scrolledAnchor = anchor

    requestAnimationFrame(() => {
      const element: HTMLElement | null = this.host.nativeElement.querySelector(
        `[data-verse="${anchor}"]`,
      )
      const body = element?.closest(".tab-body") as HTMLElement | null
      if (!element || !body) return

      const target = StudyPanelComponent.scrollTargetFor(
        body.scrollTop,
        body.clientHeight,
        element.offsetTop - body.offsetTop,
        element.offsetHeight,
      )
      // Already on screen: the reader can see the passage's references, so
      // moving them would be motion for its own sake.
      if (target === null) return
      this.glideTo(body, target)
    })
  }

  /**
   * Where the panel should scroll to bring an entry into view, or null when
   * it is already there.
   *
   * Only moves when it has to, and only as far as it has to. Re-anchoring
   * every entry to the top meant the panel lurched at each passage boundary
   * even when the next passage was already a line below the last.
   */
  static scrollTargetFor(
    viewTop: number,
    viewHeight: number,
    elementTop: number,
    elementHeight: number,
    margin = SCROLL_MARGIN,
  ): number | null {
    const viewBottom = viewTop + viewHeight
    const elementBottom = elementTop + elementHeight

    if (
      elementTop >= viewTop + margin &&
      elementBottom <= viewBottom - margin
    ) {
      return null
    }
    // Above the fold, or taller than the space left: bring its top to just
    // inside the top edge. Below it: lift it just inside the bottom edge, so
    // the panel travels the shortest distance that shows the entry.
    if (
      elementTop < viewTop + margin ||
      elementHeight > viewHeight - margin * 2
    ) {
      return Math.max(0, elementTop - margin)
    }
    return elementBottom - viewHeight + margin
  }

  /**
   * Scrolls the panel by hand rather than through `behavior: "smooth"`, whose
   * pace the browser chooses: a long jump between distant passages arrived
   * too fast to follow. Here the duration grows with the distance, within
   * bounds, so a short move stays brisk and a long one stays readable.
   */
  private glideTo(body: HTMLElement, target: number): void {
    if (this.scrollFrame !== undefined) cancelAnimationFrame(this.scrollFrame)

    const from = body.scrollTop
    const distance = target - from
    if (Math.abs(distance) < 2) return
    if (StudyPanelComponent.prefersReducedMotion()) {
      body.scrollTop = target
      return
    }

    const duration = Math.min(
      MAX_SCROLL_MS,
      Math.max(MIN_SCROLL_MS, Math.abs(distance) * SCROLL_MS_PER_PIXEL),
    )
    const started = performance.now()
    const step = (now: number) => {
      const elapsed = Math.min(1, (now - started) / duration)
      // Ease out: quick to set off, unhurried as it settles, which is what
      // reads as following the reader rather than racing them.
      const eased = 1 - (1 - elapsed) ** 3
      body.scrollTop = from + distance * eased
      if (elapsed < 1) {
        this.scrollFrame = requestAnimationFrame(step)
      } else {
        this.scrollFrame = undefined
      }
    }
    this.scrollFrame = requestAnimationFrame(step)
  }

  /** Readers who ask for less motion get the jump, not the glide. */
  private static prefersReducedMotion(): boolean {
    return (
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    )
  }

  /**
   * The entry to scroll to when nothing sits on this exact verse: the last
   * one at or before it, so the list follows the reader down rather than
   * jumping only on the verses that happen to carry a note.
   */
  private nearestAnchorAt(
    verseNumber: Verse["number"],
  ): Verse["number"] | undefined {
    const anchors = Array.from(
      this.host.nativeElement.querySelectorAll<HTMLElement>("[data-verse]"),
    )
      .map((element) => Number(element.dataset["verse"]))
      .filter((number) => Number.isFinite(number))
    if (!anchors.length) return undefined

    let best: number | undefined
    for (const candidate of anchors) {
      if (candidate <= verseNumber) best = candidate
    }
    return best ?? anchors[0]
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
        .map((footnote) => ({ verseNumber: verse.number, footnote })),
    )
  }

  /** Every cross reference in the chapter, grouped by the verse printing it. */
  private buildReferences(): void {
    this.cancelReferenceRequests()
    this.referenceGroups = []
    this.scrolledAnchor = undefined
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
