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
import { Router, RouterModule } from "@angular/router"
import {
  catchError,
  debounceTime,
  from,
  map,
  mergeMap,
  of,
  Subject,
  type Subscription,
} from "rxjs"
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
import { NetworkService } from "../../services/network.service"
import { NotesService, type VerseNote } from "../../services/notes.service"
import {
  type IncomingReference,
  type IndexState,
  ReverseReferencesService,
} from "../../services/reverse-references.service"
import { type SearchHit, SearchService } from "../../services/search.service"
import {
  lastVerseNumber,
  placeReferences,
  sectionStartsIn,
} from "../../utils/chapter-references"
import { formatPassage } from "../../utils/text"
import { getVerseQueryParams, parseReferences } from "../verse/verse.utils"

export type PanelTab = "references" | "footnotes" | "notes" | "search"

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
  verses: PreviewVerse[]
  /** Whether the passage runs on past the verses quoted here. */
  truncated?: boolean
  /** Whether it runs on past the chapter it starts in, as "1,5-2,52" does. */
  runsOn?: boolean
  failed?: boolean
}

/**
 * A passage the reader has asked to read beside the chapter, rather than
 * instead of it. Only what the reading column needs to fetch and name it.
 */
export type ParallelRequest = {
  key: string
  label: string
  bookId: Book["id"]
  chapterNumber: Chapter["number"]
  verseStart?: Verse["number"]
  verseEnd?: Verse["number"]
  /** Cited to the end of the chapter and beyond, as "Lucas 1,5-2,52" is. */
  runsOn?: boolean
  link: (string | number)[]
  queryParams: Record<string, number> | null
}

/** How far a panel-width list of results is worth going. */
const SEARCH_RESULT_LIMIT = 30

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

/**
 * A quoted verse as the panel sets it: lines of runs, rather than one string.
 *
 * A psalm quoted as a paragraph is not the psalm — the lines are part of what
 * it says — and the divine name is set in small capitals, which a flattened
 * string cannot carry either.
 */
type PreviewVerse = {
  number: Verse["number"]
  lines: { text: string; allCaps: boolean }[][]
  /** Whether this verse opens a line of its own, as poetry does. */
  breakBefore: boolean
}

/** A footnote plus the verse it hangs off, for the chapter-wide listing. */
type FootnoteEntry = {
  verseNumber: Verse["number"]
  footnote: _Footnote
}

/** How long the note box waits after the last keystroke before saving. */
const NOTE_SAVE_DEBOUNCE_MS = 500

/** The same, for the note search — short enough to feel like it types. */
export const NOTE_SEARCH_DEBOUNCE_MS = 200

/** How long the copy button confirms itself before going back to normal. */
const COPIED_FEEDBACK_MS = 1600

/** Breathing room kept between a followed entry and the panel's edges. */
const SCROLL_MARGIN = 16

/**
 * How the follow-along scroll is paced. Time per pixel travelled, bounded at
 * both ends: short moves must not crawl, long ones must not blur past. It is
 * the spring's response rather than a duration — a critically damped spring
 * has settled, to the eye, about one response after it set off.
 */
const SCROLL_MS_PER_PIXEL = 0.7
const MIN_SCROLL_MS = 260
const MAX_SCROLL_MS = 700
/** How many cited chapters are fetched at once, and how many are kept. */
const REFERENCE_FETCH_CONCURRENCY = 4
const QUOTED_CHAPTERS_KEPT = 60

/** A frame that arrives late must not fling the spring past its target. */
const MAX_FRAME_SECONDS = 1 / 30
/** Close enough, and slow enough, to call the glide finished (px, px/s). */
const REST_DISTANCE = 0.5
const REST_VELOCITY = 4
/** What the reader does to take the panel's scroll into their own hands. */
const TAKEOVER_EVENTS = ["wheel", "touchstart", "pointerdown", "keydown"]

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
  /** A cross reference the reader wants open beside the chapter. */
  @Output() openBeside = new EventEmitter<ParallelRequest>()

  activeTab: PanelTab = "references"
  referenceGroups: ReferenceGroup[] = []
  footnotes: FootnoteEntry[] = []
  chapterNotes: VerseNote[] = []
  noteMatches: VerseNote[] = []
  noteQuery = ""
  noteDraft = ""
  searchQuery = ""
  searchResults: SearchHit[] = []
  searchState: "idle" | "searching" | "done" | "failed" | "missing" = "idle"
  searchTotal = 0
  /** The search is the API's, so it is the one thing here that needs the net. */
  offline = false
  /** Set for a moment after a copy, so the button can say it worked. */
  copied = false
  readonly highlightColors = HIGHLIGHT_COLORS
  /** Passages that cite the selected verse, once the reader asks for them. */
  incoming: IncomingReference[] = []
  incomingState: IndexState = "idle"
  /** The colour on the selected verse, if the reader has marked it. */
  selectedHighlight?: HighlightColor

  /**
   * `label` is what the strip shows and `name` what the tab is called. At the
   * panel's default width the full names wrapped onto two lines, doubling
   * the height of the strip for the sake of two words; the short forms fit,
   * and each is part of its full name, so a reader who asks for the tab by
   * what they see on screen still reaches it.
   */
  readonly tabs: { id: PanelTab; label: string; name: string }[] = [
    { id: "references", label: "Referências", name: "Referências" },
    { id: "footnotes", label: "Rodapé", name: "Notas de rodapé" },
    { id: "notes", label: "Notas", name: "As minhas notas" },
    { id: "search", label: "Pesquisar", name: "Pesquisar" },
  ]

  private readonly bibleRef = inject(BibleReferenceService)
  private readonly api = inject(BibleApiService)
  private readonly bookService = inject(BookService)
  private readonly router = inject(Router)
  private readonly searchService = inject(SearchService)
  private readonly notesService = inject(NotesService)
  private readonly highlights = inject(HighlightService)
  private readonly reverseRefs = inject(ReverseReferencesService)
  private readonly network = inject(NetworkService)
  private readonly cdr = inject(ChangeDetectorRef)
  private readonly destroyRef = inject(DestroyRef)
  private readonly host: ElementRef<HTMLElement> = inject(ElementRef)

  /** The entry the panel last scrolled to, so it does not scroll there again. */
  private scrolledAnchor?: Verse["number"]
  private scrollFrame?: number
  /** The follow-along scroll in flight: where it is, and how fast. */
  private glide?: {
    body: HTMLElement
    target: number
    response: number
    position: number
    velocity: number
  }
  private readonly yielding = new WeakSet<HTMLElement>()
  /** Chapters already fetched to quote from, most recently used last. */
  private readonly quotedChapters = new Map<string, Chapter>()
  /**
   * Set once the reader has scrolled the panel themselves. They are reading
   * something there; the text moving under their other hand must not take it
   * away from them. The mark on the current passage still follows — only the
   * scrolling stops — and it is handed back when they pick a verse, change
   * tab or change chapter, which are all ways of asking the panel to look
   * somewhere new.
   */
  private readerHoldsPanel = false
  private referenceRequests: Subscription[] = []
  private notesSubscription?: Subscription
  /**
   * Queued note saves carry the book and verse they were typed for. The
   * reader can select another verse, or follow a reference into another
   * book, inside the debounce window, and resolving the target when the save
   * fires would file the note under whatever happened to be open by then.
   */
  private readonly noteInput = new Subject<{
    bookId: Book["id"]
    target: Verse
    text: string
  }>()
  private readonly noteSearch = new Subject<string>()
  private noteSearchSubscription?: Subscription
  private searchSubscription?: Subscription
  private copiedTimer?: ReturnType<typeof setTimeout>

  constructor() {
    this.noteInput
      .pipe(debounceTime(NOTE_SAVE_DEBOUNCE_MS), takeUntilDestroyed())
      .subscribe(({ bookId, target, text }) =>
        this.persistNote(bookId, target, text),
      )
    // Registered once, not per chapter: onDestroy callbacks accumulate, and
    // the reader changes chapter far more often than it destroys the panel.
    this.noteSearch
      .pipe(debounceTime(NOTE_SEARCH_DEBOUNCE_MS), takeUntilDestroyed())
      .subscribe((query) => this.runNoteSearch(query))

    this.offline = this.network.isOffline
    this.network.isOffline$.pipe(takeUntilDestroyed()).subscribe((offline) => {
      this.offline = offline
      this.cdr.markForCheck()
    })

    this.destroyRef.onDestroy(() => {
      this.notesSubscription?.unsubscribe()
      this.noteSearchSubscription?.unsubscribe()
      this.searchSubscription?.unsubscribe()
      this.stopGlide()
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
      this.readerHoldsPanel = false
      this.buildReferences()
      this.buildFootnotes()
      this.watchChapterNotes()
    }
    if (changes["selection"]) {
      // A click on the footnote marker asks for the footnotes; any other click
      // leaves the reader on the tab they were already reading.
      const requested = this.selection?.panel
      if (requested) this.activeTab = requested
      if (this.selection) this.readerHoldsPanel = false
      this.loadNoteDraft()
      this.loadSelectedHighlight()
      this.loadIncoming()
      this.scrollActiveIntoView()
    }
    if (changes["visibleVerse"] && !this.selection && !this.readerHoldsPanel) {
      this.scrollActiveIntoView()
    }
  }

  selectTab(tab: PanelTab): void {
    if (tab === this.activeTab) return
    this.activeTab = tab
    // The new tab has its own list, which has never been placed.
    this.scrolledAnchor = undefined
    this.readerHoldsPanel = false
    // Rendered here rather than left to the next change detection pass.
    // Angular coalesces those onto an animation frame, and a plain button is
    // the whole interaction — nothing else follows it to flush the queue, so
    // the strip could sit on the old tab until an unrelated event (hovering
    // a toolbar button, say) happened to trigger a pass. Every other control
    // in this app is a Material one, which renders itself and hides that.
    this.cdr.detectChanges()
  }

  /**
   * For the reader's keyboard shortcuts: shows a tab and, where the tab is
   * somewhere to type, puts the caret there — a key that opened the search
   * and left the reader to reach for the mouse would be half a shortcut.
   */
  openTab(tab: PanelTab, focus = false): void {
    this.selectTab(tab)
    if (!focus) return
    const field =
      tab === "search"
        ? "#study-search"
        : tab === "notes"
          ? "#study-note-tab"
          : undefined
    if (!field) return
    this.host.nativeElement.querySelector<HTMLElement>(field)?.focus()
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
    if (target && this.book) {
      this.noteInput.next({ bookId: this.book.id, target, text: value })
    }
  }

  /** Leaving the box saves immediately rather than waiting out the debounce. */
  onNoteBlur(): void {
    const target = this.selectedVerse
    if (target && this.book) {
      this.persistNote(this.book.id, target, this.noteDraft)
    }
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

  /**
   * Runs the reader's search, on Enter rather than as they type: this one goes
   * to the server, and a semantic search of the whole Bible is not something
   * to fire off once per keystroke.
   */
  onSearchSubmit(text: string): void {
    const query = text.trim()
    this.searchQuery = query
    this.searchSubscription?.unsubscribe()
    if (!query) {
      this.searchResults = []
      this.searchTotal = 0
      this.searchState = "idle"
      return
    }

    this.searchState = "searching"
    this.searchResults = []
    this.cdr.markForCheck()

    // A reference, or a book's name, is somewhere to go rather than words to
    // look for. The search service says which, for this box and the search
    // page alike: this one used to have a copy of its own, which did not
    // know, so "Mt 22,37" listed verses with a 22 in them.
    this.searchSubscription = this.searchService
      .run(query, SEARCH_RESULT_LIMIT)
      .subscribe({
        next: (outcome) => {
          if (outcome.kind === "destination") {
            this.searchState = "idle"
            void this.router.navigate(
              outcome.link,
              outcome.queryParams ? { queryParams: outcome.queryParams } : {},
            )
          } else if (outcome.kind === "missing") {
            this.searchState = "missing"
          } else {
            this.searchTotal = outcome.total
            this.searchResults = outcome.hits
            this.searchState = "done"
          }
          this.cdr.markForCheck()
        },
        error: () => {
          this.searchResults = []
          this.searchTotal = 0
          this.searchState = "failed"
          this.cdr.markForCheck()
        },
      })
  }

  /**
   * What the search found, and how much of it is on screen: the panel lists a
   * page of results, and a bare total would promise a list that is not there.
   */
  get searchSummary(): string {
    const shown = this.searchResults.length
    if (this.searchTotal > shown) {
      return `Primeiros ${shown} de ${this.searchTotal} resultados`
    }
    return shown === 1 ? "1 resultado" : `${shown} resultados`
  }

  /**
   * Asks for a reference to be opened beside the chapter. Only what names and
   * locates the passage is passed on: the preview the panel holds is three
   * verses, and the column beside the text shows the whole chapter.
   */
  onOpenBeside(reference: ReferenceEntry): void {
    this.openBeside.emit({
      key: reference.key,
      label: reference.label,
      bookId: reference.bookId,
      chapterNumber: reference.chapterNumber,
      verseStart: reference.verseStart,
      verseEnd: reference.verseEnd,
      runsOn: reference.runsOn,
      link: reference.link,
      queryParams: reference.queryParams,
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

  private persistNote(bookId: Book["id"], verse: Verse, text: string): void {
    this.notesService.saveNote(bookId, verse.chapterNumber, verse.number, text)
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
      // Before deciding whether to move: the reader may take hold of a panel
      // that has never had to glide anywhere.
      this.yieldToReader(body)

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
   * too fast to follow. Here the pace grows with the distance, within bounds,
   * so a short move stays brisk and a long one stays readable.
   *
   * It is a critically damped spring rather than a timed curve, for the one
   * thing a timed curve cannot do: be given a new target while it is moving.
   * The panel follows the reading position, so its target changes every few
   * verses while the text scrolls; an ease-out restarted on each change sets
   * off at full speed from a standstill every time, which read as a stutter.
   * The spring keeps the speed it has and bends towards the new target.
   */
  private glideTo(body: HTMLElement, target: number): void {
    if (StudyPanelComponent.prefersReducedMotion()) {
      this.stopGlide()
      body.scrollTop = target
      return
    }

    const running = this.glide?.body === body ? this.glide : undefined
    const position = running?.position ?? body.scrollTop
    const distance = Math.abs(target - position)
    if (!running && distance < 2) return

    const response =
      Math.min(
        MAX_SCROLL_MS,
        Math.max(MIN_SCROLL_MS, distance * SCROLL_MS_PER_PIXEL),
      ) / 1000

    if (running) {
      // Already moving: only where it is going changes.
      running.target = target
      running.response = response
      return
    }

    this.yieldToReader(body)
    this.glide = { body, target, response, position, velocity: 0 }
    // Timed by the frames' own clock, from the first one: measured against
    // any other, the first step can come out negative and throw the spring.
    let last: number | undefined
    const step = (now: number) => {
      const glide = this.glide
      if (!glide) return
      // The reader moved it by some means the listeners did not see — the
      // scrollbar, a find-in-page. It is theirs; writing the spring's own
      // position back would pull it out of their hands.
      if (Math.abs(glide.body.scrollTop - glide.position) > 2) {
        this.stopGlide()
        return
      }

      const dt =
        last === undefined
          ? 1 / 60
          : Math.min(MAX_FRAME_SECONDS, Math.max(0, (now - last) / 1000))
      last = now
      // The closed form of a critically damped spring over one frame, so a
      // slow frame costs accuracy nowhere and cannot make it overshoot.
      const omega = (2 * Math.PI) / glide.response
      const offset = glide.position - glide.target
      const drift = glide.velocity + omega * offset
      const decay = Math.exp(-omega * dt)
      glide.position = glide.target + (offset + drift * dt) * decay
      glide.velocity = (drift - omega * (offset + drift * dt)) * decay

      const atRest =
        Math.abs(glide.position - glide.target) < REST_DISTANCE &&
        Math.abs(glide.velocity) < REST_VELOCITY
      if (atRest) glide.position = glide.target
      glide.body.scrollTop = glide.position
      // What the element accepted, not what was asked of it: it rounds, and
      // it stops at its ends, and the takeover check above compares to this.
      if (atRest || Math.abs(glide.body.scrollTop - glide.position) > 1) {
        this.stopGlide()
        return
      }
      this.scrollFrame = requestAnimationFrame(step)
    }
    this.scrollFrame = requestAnimationFrame(step)
  }

  private stopGlide(): void {
    if (this.scrollFrame !== undefined) cancelAnimationFrame(this.scrollFrame)
    this.scrollFrame = undefined
    this.glide = undefined
  }

  /**
   * The glide gives way the moment the reader reaches for the panel. Without
   * this it wrote its own position over theirs on every frame, so a wheel
   * turn in the middle of a glide did nothing until the glide had finished.
   *
   * Native and passive rather than template bindings: a wheel event per
   * frame has no business running change detection.
   */
  private yieldToReader(body: HTMLElement): void {
    if (this.yielding.has(body)) return
    this.yielding.add(body)
    for (const name of TAKEOVER_EVENTS) {
      body.addEventListener(
        name,
        () => {
          this.stopGlide()
          this.readerHoldsPanel = true
        },
        { passive: true },
      )
    }
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
    const lastVerse = lastVerseNumber(verses)
    const sectionStarts = sectionStartsIn(verses)

    // Collected by the verse each passage *starts* at, which is not the verse
    // its references are printed on — see placeReferences.
    // A division's own references are kept apart from the first passage's,
    // which start at the same verse, by carrying the division's range as
    // their label — see divisionLabel.
    const byStart = new Map<
      string,
      {
        verseNumber: Verse["number"]
        label?: string
        entries: ReferenceEntry[]
      }
    >()
    const seen = new Set<string>()
    for (const placed of placeReferences(verses, sectionStarts)) {
      const { part, verse, startsAt, underMajorHeading } = placed

      const extracted = this.bibleRef.extract(
        part.text,
        verse.bookId,
        verse.chapterNumber,
      )
      // The extent of the division this block belongs to, once its opening
      // range has named it.
      let division: string | undefined
      for (const [position, reference] of extracted.entries()) {
        // findBook falls back to the About page for anything it cannot
        // resolve; listed, that was an "About 25" entry fetching a chapter
        // of the About page. A parse artefact is not a passage.
        if (this.bookService.findBook(reference.book).id === "about") continue
        const entry = this.toEntry(reference)
        // A block under a major heading opens with the range that heading
        // covers, and may go on to a passage worth reading beside it:
        // Matthew's "(1,1-2,23; ver Lc 1,5-2,52)" is this division's own
        // extent and then the parallel gospel. The extent is not a
        // reference — it is what the references after it are references
        // *for*, so it becomes their heading in the panel.
        if (
          underMajorHeading &&
          position === 0 &&
          entry.bookId === verse.bookId
        ) {
          division = StudyPanelComponent.divisionLabel(reference)
          continue
        }
        const groupKey = division ? `${startsAt}|${division}` : `${startsAt}`
        // The same passage can be cited twice (two references blocks either
        // side of a quote); list it once.
        const key = `${groupKey}:${entry.key}`
        if (seen.has(key)) continue
        seen.add(key)
        const group = byStart.get(groupKey)
        if (group) {
          group.entries.push(entry)
        } else {
          byStart.set(groupKey, {
            verseNumber: startsAt,
            label: division,
            entries: [entry],
          })
        }
      }
    }

    const groups: ReferenceGroup[] = Array.from(byStart.values())
      .sort((a, b) => a.verseNumber - b.verseNumber)
      .map((group) => {
        const nextStart = sectionStarts.find(
          (start) => start > group.verseNumber,
        )
        const endsAt = nextStart === undefined ? lastVerse : nextStart - 1
        return {
          verseNumber: group.verseNumber,
          // A division names its own extent; a passage is named by where it
          // runs from and to.
          label: group.label ?? this.passageLabel(group.verseNumber, endsAt),
          entries: group.entries,
          lastVerse: endsAt,
        }
      })

    this.referenceGroups = groups
    this.fetchReferenceTexts(groups)
  }

  /** "1,8-22" — the passage a group of references covers. */
  private passageLabel(
    startsAt: Verse["number"],
    endsAt: Verse["number"],
  ): string {
    const chapter = this.chapter?.number ?? ""
    return endsAt > startsAt
      ? `${chapter},${startsAt}-${endsAt}`
      : `${chapter},${startsAt}`
  }

  private toEntry(reference: BibleReference): ReferenceEntry {
    const target = this.bookService.findBook(reference.book)
    const params = getVerseQueryParams(reference.verses, reference.crossChapter)
    // A run of whole chapters names both ends; anything else names verses.
    if (reference.endChapter) {
      return {
        verses: [],
        key: `${target.id}:${reference.chapter}-${reference.endChapter}`,
        label: `${target.shortName} ${reference.chapter}-${reference.endChapter}`,
        bookId: target.id,
        chapterNumber: reference.chapter,
        link: ["/", this.bookService.getUrlAbrv(target), reference.chapter],
        queryParams: null,
      }
    }

    // A range that runs out of its chapter names where it ends as well as
    // where it starts: "Lucas 1,5-2,52", not "Lucas 1,5".
    const cross = reference.crossChapter
    if (cross) {
      const ends = `${cross.startChapter},${cross.startVerse}-${cross.endChapter},${cross.endVerse}`
      return {
        verses: [],
        key: `${target.id}:${ends}`,
        label: `${target.shortName} ${ends}`,
        bookId: target.id,
        chapterNumber: cross.startChapter,
        verseStart: cross.startVerse,
        // It is cited to the end of this chapter and into the next, so the
        // preview quotes its opening the way any long passage's is quoted.
        runsOn: true,
        link: ["/", this.bookService.getUrlAbrv(target), cross.startChapter],
        queryParams: params,
      }
    }

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
   * parallels of one passage often share one), requests for the same
   * chapter in flight are shared by BibleApiService, and it is the same
   * request the reader makes anyway if they follow the link. What comes back
   * is kept here, since that service keeps nothing once a request settles.
   */
  private fetchReferenceTexts(groups: ReferenceGroup[]): void {
    const byChapter = new Map<string, ReferenceEntry[]>()
    for (const group of groups) {
      for (const entry of group.entries) {
        // Entries with no verse cite a whole chapter, and are fetched too:
        // the chapter is what they point at, and its opening verses are what
        // tell the reader whether it is the passage they had in mind.
        const key = `${entry.bookId}:${entry.chapterNumber}`
        const pending = byChapter.get(key)
        if (pending) {
          pending.push(entry)
        } else {
          byChapter.set(key, [entry])
        }
      }
    }

    // What the panel has quoted before, it quotes again without asking: a
    // reader going back and forth between two chapters was refetching every
    // chapter either of them cites, each time.
    const wanted: [string, ReferenceEntry[]][] = []
    for (const [key, entries] of byChapter) {
      const remembered = this.quotedChapters.get(key)
      if (!remembered) {
        wanted.push([key, entries])
        continue
      }
      for (const entry of entries) StudyPanelComponent.fill(entry, remembered)
    }

    // A few at a time. A chapter of a gospel cites dozens of others, and all
    // of them at once competed with the chapter the reader is waiting for.
    this.referenceRequests.push(
      from(wanted)
        .pipe(
          mergeMap(
            ([key, entries]) =>
              this.api
                .getChapter(entries[0].bookId, entries[0].chapterNumber)
                .pipe(
                  map((chapter) => ({ key, entries, chapter })),
                  // Offline, or a reference the API cannot resolve: the
                  // entries stay links, which is still the useful half.
                  catchError(() => of({ key, entries, chapter: undefined })),
                ),
            REFERENCE_FETCH_CONCURRENCY,
          ),
        )
        .subscribe(({ key, entries, chapter }) => {
          if (chapter) this.rememberQuoted(key, chapter)
          for (const entry of entries) {
            if (chapter) StudyPanelComponent.fill(entry, chapter)
            else entry.failed = true
          }
          this.cdr.markForCheck()
        }),
    )
  }

  private rememberQuoted(key: string, chapter: Chapter): void {
    this.quotedChapters.delete(key)
    this.quotedChapters.set(key, chapter)
    // A Map keeps insertion order, so its first key is the one longest unused.
    if (this.quotedChapters.size > QUOTED_CHAPTERS_KEPT) {
      const oldest = this.quotedChapters.keys().next().value
      if (oldest !== undefined) this.quotedChapters.delete(oldest)
    }
  }

  private cancelReferenceRequests(): void {
    for (const request of this.referenceRequests) request.unsubscribe()
    this.referenceRequests = []
  }

  /** Quotes the passage's opening verses onto the entry. */
  private static fill(entry: ReferenceEntry, chapter: Chapter): void {
    // Verse 0 is the chapter's front matter, not a verse to quote.
    const verses = (chapter.verses ?? []).filter((verse) => verse.number > 0)
    const start = entry.verseStart
    const wanted =
      start === undefined
        ? // A whole chapter: its opening verses stand for it, the same way
          // the opening of a long range does.
          verses
        : // A reference with no end verse cites a single verse, unless it
          // runs out of the chapter, in which case the rest of the chapter is
          // cited and then some.
          verses.filter(
            (verse) =>
              verse.number >= start &&
              (entry.runsOn === true ||
                verse.number <= (entry.verseEnd ?? start)),
          )
    if (!wanted.length) {
      entry.failed = true
      return
    }
    const quoted = wanted
      .slice(0, MAX_QUOTED_VERSES)
      .map((verse) => ({
        number: verse.number,
        lines: StudyPanelComponent.previewLines(verse),
        poetry: (verse.text ?? []).some((part) => part.type === "quote"),
      }))
      .filter((preview) => preview.lines.length > 0)

    // Prose verses run on, as they do in the chapter; a verse set as poetry
    // takes its own line, and so does the one after it.
    entry.verses = quoted.map((preview, index) => ({
      number: preview.number,
      lines: preview.lines,
      breakBefore:
        index > 0 && (preview.poetry || quoted[index - 1].poetry === true),
    }))
    entry.truncated = entry.runsOn === true || wanted.length > MAX_QUOTED_VERSES
  }

  /**
   * A verse as the panel quotes it: the lines it is set in, each a run of
   * words carrying whether it is small-capped.
   *
   * The parts arrive with their own spacing, so they are concatenated rather
   * than trimmed and rejoined — trimming each and putting a space between
   * them is what produced "o Senhor !" where the edition prints "o SENHOR!".
   * The zero-width space that opens poetry is dropped, being a format
   * character rather than a word.
   *
   * A quote or a paragraph opens a new line, as it does in the chapter: this
   * edition sets the scripture a verse quotes on its own line, and run
   * together it reads as "disse Deus alguma vez:Tu és meu Filho". Empty parts
   * are dropped before they can break anything — the paragraph that closes a
   * verse carries a newline and nothing else.
   */
  private static previewLines(verse: Verse): PreviewVerse["lines"] {
    const lines: PreviewVerse["lines"] = []
    let line: PreviewVerse["lines"][number] = []

    for (const part of verse.text ?? []) {
      if (
        part.type !== "text" &&
        part.type !== "quote" &&
        part.type !== "paragraph"
      ) {
        continue
      }
      const text = part.text.replace(/[\u200b-\u200d\ufeff]/g, "")
      if (!text.trim()) continue
      if (part.type !== "text" && line.length) {
        lines.push(line)
        line = []
      }
      line.push({
        text,
        allCaps: part.type === "text" && part.allCaps === true,
      })
    }
    if (line.length) lines.push(line)

    // Trim the ends of the quotation without touching the spacing inside it.
    const first = lines[0]?.[0]
    if (first) first.text = first.text.replace(/^\s+/, "")
    const lastLine = lines[lines.length - 1]
    const last = lastLine?.[lastLine.length - 1]
    if (last) last.text = last.text.replace(/\s+$/, "")
    return lines
  }

  /**
   * How a division's own range is printed — "1,1-2,23" — with no book named,
   * it being the book the reader is in.
   */
  private static divisionLabel(reference: BibleReference): string {
    const cross = reference.crossChapter
    if (cross) {
      return `${cross.startChapter},${cross.startVerse}-${cross.endChapter},${cross.endVerse}`
    }
    if (reference.endChapter) {
      return `${reference.chapter}-${reference.endChapter}`
    }
    const params = getVerseQueryParams(reference.verses, undefined)
    if (params?.verseEnd) {
      return `${reference.chapter},${params.verseStart}-${params.verseEnd}`
    }
    return params?.verseStart
      ? `${reference.chapter},${params.verseStart}`
      : `${reference.chapter}`
  }

  /** The readable words of a verse, for copying rather than for setting. */
  private static plainText(verse: Verse): string {
    return StudyPanelComponent.previewLines(verse)
      .map((line) => line.map((run) => run.text).join(""))
      .join("\n")
      .trim()
  }
}
