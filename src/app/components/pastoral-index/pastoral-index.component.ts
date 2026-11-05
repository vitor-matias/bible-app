import { BreakpointObserver } from "@angular/cdk/layout"
import { DOCUMENT, isPlatformBrowser, Location } from "@angular/common"
import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  Injector,
  inject,
  type OnDestroy,
  type OnInit,
  PLATFORM_ID,
  signal,
  untracked,
  viewChild,
} from "@angular/core"
import { takeUntilDestroyed, toSignal } from "@angular/core/rxjs-interop"
import { MatBottomSheet } from "@angular/material/bottom-sheet"
import { MatButtonModule } from "@angular/material/button"
import { MatRippleModule } from "@angular/material/core"
import { MatDialog } from "@angular/material/dialog"
import { MatDividerModule } from "@angular/material/divider"
import {
  MatExpansionModule,
  type MatExpansionPanel,
} from "@angular/material/expansion"
import { MatFormFieldModule } from "@angular/material/form-field"
import { MatIconModule } from "@angular/material/icon"
import { MatInputModule } from "@angular/material/input"
import { MatMenuModule } from "@angular/material/menu"
import { MatToolbarModule } from "@angular/material/toolbar"
import { MatTooltipModule } from "@angular/material/tooltip"
import {
  ActivatedRoute,
  NavigationSkipped,
  type Params,
  Router,
  RouterLink,
} from "@angular/router"
import { animationFrameScheduler, fromEvent } from "rxjs"
import { auditTime, map } from "rxjs/operators"
import { PASTORAL_INDEX_BOOK } from "../../bible-canon"
import { shareableUrl } from "../../config"
import {
  type TextSize,
  UnifiedGesturesDirective,
} from "../../directives/unified-gesture.directive"
import {
  INDEX_BOOKMARK_CHAPTER,
  indexBookmarkId,
} from "../../pastoral-index-bookmarks"
import { AnalyticsService } from "../../services/analytics.service"
import { BackButtonService } from "../../services/back-button.service"
import {
  type BibleReference,
  BibleReferenceService,
} from "../../services/bible-reference.service"
import { BookService } from "../../services/book.service"
import { BookmarkService } from "../../services/bookmark.service"
import {
  ribbonColor,
  spokenRibbonName,
} from "../../services/bookmark-ribbons.service"
import {
  BuildVersionService,
  type DisplayVersion,
} from "../../services/build-version.service"
import { HapticsService } from "../../services/haptics.service"
import { NativeBookmarksService } from "../../services/native-bookmarks.service"
import { NativeChromeService } from "../../services/native-chrome.service"
import type { NativeChromeAction } from "../../services/native-chrome.types"
import { NativeReportService } from "../../services/native-report.service"
import { OnboardingService } from "../../services/onboarding.service"
import { PwaInstallService } from "../../services/pwa-install.service"
import { SeoService } from "../../services/seo.service"
import { type ThemeMode, ThemeService } from "../../services/theme.service"
import { ToastService } from "../../services/toast.service"
import { buildPassagePicker } from "../../utils/passage-picker"
import { foldText } from "../../utils/text-search"
import { BookmarkSelectorComponent } from "../bookmark-selector/bookmark-selector.component"
import { PRIVACY_POLICY_URL } from "../header/header.component"
import { ReportProblemComponent } from "../report-problem/report-problem.component"
import { getVerseQueryParams, parseReferences } from "../verse/verse.utils"
import { AlphabeticalScrollBarComponent } from "./alphabetical-scroll-bar.component"
import { FastScrollerComponent } from "./fast-scroller.component"
import entries from "./pastoral-index.data.json"

/** Made by scripts/build-pastoral-index.mjs: text, and links to other entries. */
type EntryPart = string | { text: string; slug: string }

interface PastoralEntry {
  slug: string
  title: string
  paragraphs: EntryPart[][]
}

interface TextPart {
  text: string
  /** A citation: where it opens in the reader. */
  link?: (string | number)[]
  /** A cross-reference: the theme it expands. */
  see?: string
  query?: Params | null
}

const ENTRIES: PastoralEntry[] = entries

/** A tapped theme's glide to its place: this long at least, this long at most. */
const GLIDE_MIN_MS = 550
const GLIDE_MAX_MS = 950

/**
 * In the apps a theme opens at once, as a list row does, and comes up under the
 * bar as it opens: no wait for the page to get there first.
 */
const NATIVE_OPEN_MS = 300

/** How long a jump or that opening may scroll without moving the apps' bars. */
const BARS_HELD_MS = NATIVE_OPEN_MS + 100

/** Each new letter of a drag along the scroll bar: chasing the finger, so no slow start. */
const DRAG_GLIDE_MS = 350
const easeOutCubic = (t: number) => 1 - (1 - t) ** 3

/** Slow to start, slow to arrive. */
const easeInOutCubic = (t: number) =>
  t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2

/** How far below the bars a letter's heading can be and count as current. */
const CURRENT_LETTER_MARGIN = 64

/**
 * The verses a citation's first "(n)" marks, as the reader's `notes` parameter
 * takes them: "36", "6-7". The mark follows its verses, in the citation's text
 * or just after it ("Mt 5,3.7 (n).9", "Mc 14,36 (n)"). Null without a mark.
 */
function notedVerses(ref: BibleReference, after?: string): string | null {
  const inMatch = ref.match.indexOf("(n)")
  if (inMatch < 0 && !after?.trimStart().startsWith("(n)")) return null
  if (ref.crossChapter) return `${ref.crossChapter.startVerse}-999`
  const verses = ref.verses ?? []
  const verse =
    verses[
      inMatch < 0
        ? verses.length - 1
        : ref.match.slice(0, inMatch).split(".").length - 1
    ]
  if (!verse) return null
  return verse.type === "single"
    ? `${verse.verse}`
    : `${verse.start}-${verse.end}`
}

/** A click with a modifier opens a new tab or window, not this app's page. */
const leftToTheBrowser = (event: MouseEvent) =>
  event.ctrlKey || event.metaKey || event.shiftKey || event.altKey

/**
 * The Índice Bíblico-Pastoral: its themes at /indice, which expand in place. A
 * theme's address, /indice/:slug, is this page with that theme open.
 */
@Component({
  selector: "pastoral-index",
  imports: [
    RouterLink,
    MatToolbarModule,
    MatButtonModule,
    MatRippleModule,
    MatIconModule,
    MatExpansionModule,
    MatFormFieldModule,
    MatInputModule,
    MatMenuModule,
    MatDividerModule,
    MatTooltipModule,
    UnifiedGesturesDirective,
    AlphabeticalScrollBarComponent,
    FastScrollerComponent,
  ],
  host: {
    "[class.native]": "native",
    "[class.android]": "android",
    "[class.ios]": "native && !android",
  },
  templateUrl: "./pastoral-index.component.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrls: [
    "../book-index/book-index.component.css",
    "./pastoral-index.component.css",
    "./pastoral-index.columns.css",
    "./pastoral-index.native.css",
  ],
})
export class PastoralIndexComponent implements OnInit, OnDestroy {
  private bibleRef = inject(BibleReferenceService)
  private bookService = inject(BookService)
  private seoService = inject(SeoService)
  private nativeChrome = inject(NativeChromeService)
  private themeService = inject(ThemeService)
  private toast = inject(ToastService)
  private onboarding = inject(OnboardingService)
  private bookmarkService = inject(BookmarkService)
  private nativeBookmarks = inject(NativeBookmarksService)
  private nativeReport = inject(NativeReportService)
  private haptics = inject(HapticsService)
  private bottomSheet = inject(MatBottomSheet)
  private backButton = inject(BackButtonService)
  private dialog = inject(MatDialog)
  private pwaInstall = inject(PwaInstallService)
  private buildVersion = inject(BuildVersionService)
  readonly analytics = inject(AnalyticsService)
  private route = inject(ActivatedRoute)
  private router = inject(Router)
  private location = inject(Location)
  private destroyRef = inject(DestroyRef)
  private injector = inject(Injector)
  /** The native apps draw this page's toolbar. */
  readonly native = this.nativeChrome.enabled
  /** Material's list and fast scroller, where iOS has its section index. */
  readonly android = this.nativeChrome.android

  private books = toSignal(this.bookService.books$, { initialValue: [] })
  private booksKnown = computed(() => this.books().length)
  private slug = signal<string | null>(null)

  /**
   * Where two columns fit, every theme is open, as on the printed page. A web
   * page's layout: the apps keep their list, turned on its side or on a tablet.
   */
  readonly wide = this.native
    ? signal(false).asReadonly()
    : toSignal(
        inject(BreakpointObserver)
          .observe("(min-width: 768px)")
          .pipe(map(({ matches }) => matches)),
        { requireSync: true },
      )

  /** The theme to bring to the top once its panel has finished opening. */
  private scrollTarget: string | null = null
  /** Whether the theme being opened was tapped, so scrolls there smoothly. */
  private scrollSmoothly = false
  /** Where a tapped theme's title was, to hold it there as another closes. */
  private heldTop: number | null = null
  /** Stops the glide under way, if any. */
  private stopGlide?: (arrived?: boolean) => void
  /** The element being glided to, to leave a glide there undisturbed. */
  private glidingTo: HTMLElement | null = null
  /** A tapped theme, to open once the page has scrolled to it. */
  private pendingOpen: string | null = null

  readonly query = signal("")
  /** In the apps, whether the shell's filter field is showing. */
  private filterOpen = signal(false)
  readonly privacyPolicyUrl = PRIVACY_POLICY_URL
  readonly ribbonColor = ribbonColor
  readonly canInstall = toSignal(this.pwaInstall.canPromptInstall$, {
    requireSync: true,
  })
  readonly canShare =
    typeof navigator !== "undefined" && typeof navigator.share === "function"
  /** Small print under the menu's last item; null until it is known. */
  readonly version = signal<DisplayVersion | null>(null)

  /** The reader's text size, which this page shares (fontSizeContext). */
  private textSize = viewChild(UnifiedGesturesDirective)
  /** The size and its range, for Android's text sheet. */
  readonly textSizeState = signal<TextSize | null>(null)
  /** The theme the menus show, which ThemeService keeps out of signals' reach. */
  private themeMode = signal<ThemeMode>(this.themeService.currentMode)

  private bookmarks = toSignal(this.bookmarkService.bookmarks$, {
    initialValue: [],
  })
  /** The ribbon on each marked theme, by the book a ribbon stores for it. */
  private ribbons = computed(
    () => new Map(this.bookmarks().map((b) => [b.bookId, b.color])),
  )

  ribbonOn(slug: string): string | undefined {
    return this.ribbons().get(indexBookmarkId(slug))
  }

  /** The ribbon's spoken name in lowercase, after the title: "vermelho". */
  ribbonName(color: string): string {
    return (spokenRibbonName(color) ?? color).toLocaleLowerCase("pt")
  }

  /** The reader's ribbons, on the theme open, or the index when none is. */
  openBookmarks(): void {
    const bookId = indexBookmarkId(this.slug())
    if (this.native) {
      this.nativeBookmarks.open(bookId, INDEX_BOOKMARK_CHAPTER)
      return
    }
    this.backButton.closeOnBack(
      this.bottomSheet.open(BookmarkSelectorComponent, {
        data: { bookId, chapter: INDEX_BOOKMARK_CHAPTER },
      }),
    )
  }

  decreaseFontSize(step?: number): void {
    this.textSize()?.decreaseFontSize(step)
  }

  increaseFontSize(step?: number): void {
    this.textSize()?.increaseFontSize(step)
  }

  async share(): Promise<void> {
    const entry = this.entry()
    const title = "Bíblia Sagrada"
    const text = entry
      ? `Ler ${entry.title} no Índice Bíblico-Pastoral.`
      : "Ler o Índice Bíblico-Pastoral."
    const url = shareableUrl(window.location)
    try {
      if (this.native) {
        const shared = await this.nativeChrome.share({
          title,
          text,
          url,
          linkTitle: document.title || title,
        })
        if (!shared) return
      } else {
        await navigator.share({ title, text, url })
      }
      void this.analytics.track("share", {
        book: indexBookmarkId(entry?.slug),
      })
    } catch {
      // Canceled or failed; no UI feedback needed, as in the reader.
    }
  }

  async install(): Promise<void> {
    const outcome = await this.pwaInstall.promptInstall()
    // AnalyticsService.track overwrites `platform`, hence the distinct key.
    void this.analytics.track("pwa_install_prompt", {
      outcome,
      installPlatform: this.pwaInstall.detectPlatform(),
    })
  }

  reportProblem(): void {
    const entry = this.entry()
    const title = entry?.title ?? PASTORAL_INDEX_BOOK.shortName
    const book = {
      ...PASTORAL_INDEX_BOOK,
      id: indexBookmarkId(entry?.slug),
      name: title,
      shortName: title,
    }
    if (this.native) {
      this.nativeReport.open(book, INDEX_BOOKMARK_CHAPTER)
      return
    }
    this.dialog.open(ReportProblemComponent, {
      data: { book, chapter: INDEX_BOOKMARK_CHAPTER },
      width: "90%",
      maxWidth: "500px",
    })
  }

  /** Which theme is on: the menu's button cycles through them. */
  get theme(): { icon: string; label: string } {
    const mode = this.themeService.currentMode
    if (mode === "system") {
      return { icon: "brightness_auto", label: "Tema: Automático" }
    }
    return mode === "light"
      ? { icon: "light_mode", label: "Tema: Claro" }
      : { icon: "dark_mode", label: "Tema: Escuro" }
  }

  toggleTheme(): void {
    this.themeService.toggleTheme()
  }

  openHelp(): void {
    this.onboarding.open("menu")
  }

  openAbout(): void {
    const about = this.bookService.getAboutBook()
    void this.router.navigate(["/", this.bookService.getUrlAbrv(about), 1])
  }

  /** The theme open on a phone: a tapped one only once the page reaches it. */
  readonly expandedSlug = signal<string | null>(null)

  readonly entry = computed(() =>
    ENTRIES.find((entry) => entry.slug === this.slug()),
  )

  /** The themes that match the filter, under their first letters. */
  readonly groups = computed(() => {
    const query = foldText(this.query().trim())
    const groups = new Map<string, PastoralEntry[]>()
    for (const entry of ENTRIES) {
      const title = foldText(entry.title)
      if (!title.includes(query)) continue
      const letter = title[0].toLocaleUpperCase("pt")
      groups.set(letter, [...(groups.get(letter) ?? []), entry])
    }
    return [...groups].map(([letter, entries]) => ({ letter, entries }))
  })

  /** Each opened theme's text; its citations link once the books are known. */
  private paragraphsBySlug = computed(() => {
    // The count alone: books$ emits again as each introduction loads.
    this.booksKnown()
    return new Map<string, TextPart[][]>()
  })

  paragraphsOf(entry: PastoralEntry): TextPart[][] {
    const cache = this.paragraphsBySlug()
    let paragraphs = cache.get(entry.slug)
    if (!paragraphs) {
      paragraphs = entry.paragraphs.map((parts) =>
        parts.flatMap((part) => this.textParts(part)),
      )
      cache.set(entry.slug, paragraphs)
    }
    return paragraphs
  }

  constructor() {
    this.destroyRef.onDestroy(() => this.stopGlide?.(false))
    if (this.native) {
      // The bars are a book's, the index being one in the book lists: what
      // they show follows the theme open, its ribbon and the filter.
      effect(() => {
        const color = this.ribbons().get(indexBookmarkId(this.slug())) ?? null
        const title = PASTORAL_INDEX_BOOK.name
        this.nativeChrome.show({
          mode: "reader",
          themeMode: this.themeMode(),
          passageLabel: title,
          passageShortLabels: [PASTORAL_INDEX_BOOK.abrv],
          passageAccessibilityLabel: [
            title,
            ...(this.entry() ? [this.entry()?.title] : []),
            ...(color ? [`marcador ${this.ribbonName(color)}`] : []),
          ].join(", "),
          chapterNavigation: false,
          canGoPrevious: false,
          canGoNext: false,
          search: true,
          viewMode: null,
          autoScrollVisible: false,
          autoScrollAvailable: false,
          canShare: true,
          canReport: this.analytics.areAnalyticsAvailable(),
          bookmarkColor: color,
          bookmarkName: null,
          buildVersion: this.version()?.build ?? null,
          textSize: this.textSizeState(),
          filterPlaceholder: "Filtrar temas",
          filterOpen: this.filterOpen(),
          query: this.query(),
        })
      })
    }
    if (this.isBrowser) {
      const root = inject(DOCUMENT).documentElement
      // The letters stand in for the native scrollbar where they run down the
      // edge (styles.css), on this page only.
      effect(() => root.classList.toggle("no-scrollbar", !this.wide()))
      this.destroyRef.onDestroy(() => root.classList.remove("no-scrollbar"))

      fromEvent(window, "scroll", { passive: true })
        .pipe(
          auditTime(0, animationFrameScheduler),
          takeUntilDestroyed(this.destroyRef),
        )
        .subscribe(() => this.updateCurrentLetter())
      // The filter and the first render change the letters without a scroll.
      effect(() => {
        this.groups()
        afterNextRender(() => this.updateCurrentLetter(), {
          injector: this.injector,
        })
      })
    }

    // Rotating a phone crosses the breakpoint, and every theme opens or folds
    // above the one being read. Back to it once they have.
    let first = true
    effect((onCleanup) => {
      this.wide()
      if (first) {
        first = false
        return
      }
      const slug = untracked(this.slug)
      this.scrollSmoothly = false
      // shortcut: the panels' 225 ms animation, assumed over; a slow device can
      // land short, use their afterExpand if that turns up.
      if (!slug) return
      const settling = setTimeout(() => this.scrollTo(slug), 300)
      onCleanup(() => clearTimeout(settling))
    })
  }

  ngOnInit(): void {
    this.seoService.updateForPastoralIndex()
    this.route.paramMap
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((params) => {
        this.scrollSmoothly = false
        this.show(params.get("slug"))
      })

    // A ribbon on a theme this page already opened at: the router, which the
    // page's own address changes don't reach, sees nothing to do.
    this.router.events
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((event) => {
        if (!(event instanceof NavigationSkipped)) return
        const slug = /^\/indice\/([^/?#]+)/.exec(event.url)?.[1]
        if (slug) {
          this.scrollSmoothly = false
          this.expand(slug)
        }
      })

    void this.buildVersion
      .getDisplayVersion()
      .then((version) => this.version.set(version))

    if (this.native) {
      this.nativeChrome.actions$
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe((action) => this.onNativeAction(action))
      // The bars hide as the text is read, as in a chapter.
      this.destroyRef.onDestroy(
        this.nativeChrome.trackScroll(document.documentElement, document),
      )
    }
  }

  private onNativeAction(action: NativeChromeAction): void {
    switch (action.id) {
      case "passage":
        this.nativeChrome.showPicker(
          buildPassagePicker(this.bookService.getBooks(), this.bookmarks(), {
            bookId: PASTORAL_INDEX_BOOK.id,
            chapter: INDEX_BOOKMARK_CHAPTER,
          }),
        )
        break
      case "goto":
        this.goToPassage(action.bookId, action.chapter)
        break
      case "search":
        void this.router.navigate(["/search"])
        break
      case "filter":
        this.filterOpen.set(true)
        break
      case "filter-close":
        this.filterOpen.set(false)
        if (this.query()) this.filter("")
        break
      case "search-input":
        this.filter(action.text)
        break
      case "bookmarks":
        this.openBookmarks()
        break
      case "theme-system":
      case "theme-light":
      case "theme-dark":
        this.themeMode.set(action.id.slice("theme-".length) as ThemeMode)
        this.themeService.setTheme(this.themeMode())
        break
      case "font-decrease":
        this.decreaseFontSize(action.step)
        break
      case "font-increase":
        this.increaseFontSize(action.step)
        break
      case "font-reset":
        this.textSize()?.resetFontSize()
        break
      case "share":
        void this.share()
        break
      case "report":
        this.reportProblem()
        break
      case "about":
        this.openAbout()
        break
      case "help":
        this.openHelp()
        break
      case "privacy":
        window.open(PRIVACY_POLICY_URL, "_blank", "noopener")
        break
    }
  }

  ngOnDestroy(): void {
    if (this.native) this.nativeChrome.hide()
  }

  /** A book chosen in the picker, as the reader goes to one: the index itself opens at its top. */
  private goToPassage(bookId: string, chapter?: number): void {
    if (bookId === PASTORAL_INDEX_BOOK.id) {
      this.expand(null)
      window.scrollTo({ top: 0, behavior: "instant" })
      return
    }
    const book = this.bookService.findBook(bookId)
    void this.router.navigate([
      "/",
      this.bookService.getUrlAbrv(book),
      this.bookService.getChapterUrlSegment(
        chapter ?? (book.introSlug ? 0 : 1),
      ),
    ])
  }

  /** A citation leaves for the reader: a toast offers the way back here. */
  followCitation(event: MouseEvent, slug: string): void {
    // A new tab or window: the page stays here, with nothing to go back to.
    if (leftToTheBrowser(event)) return
    this.toast.showReturnToIndex(slug)
  }

  /** The phone's scroll bar measures itself, so never in a prerender. */
  readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID))

  /**
   * Narrows the list, closing the theme open on a phone, which would push the
   * results away; from far down it, brings them into view.
   */
  filter(query: string): void {
    // In the apps an emptied field gives the whole list back, with the theme
    // chosen from the results still open and in view.
    if (this.native && !query.trim()) {
      this.query.set(query)
      const slug = this.slug()
      afterNextRender(
        () => {
          if (slug) {
            this.scrollSmoothly = false
            this.scrollTo(slug)
          } else {
            window.scrollTo({ top: 0, behavior: "instant" })
          }
        },
        { injector: this.injector },
      )
      return
    }
    this.query.set(query)
    if (!this.wide() && this.slug()) {
      this.stopGlide?.(false)
      this.pendingOpen = null
      this.heldTop = null
      this.expand(null)
    }
    afterNextRender(
      () => {
        // The results take the screen's place, from their top, as a native
        // search's do.
        if (this.native) {
          window.scrollTo({ top: 0, behavior: "instant" })
          return
        }
        const list = document.querySelector("mat-accordion")
        const tools = document.querySelector(".index-tools")
        if (
          list &&
          tools &&
          list.getBoundingClientRect().top <
            tools.getBoundingClientRect().bottom
        ) {
          list.scrollIntoView()
        }
      },
      { injector: this.injector },
    )
  }

  /** The letter whose themes are on screen, highlighted among the letters. */
  readonly currentLetter = signal<string | null>(null)

  private updateCurrentLetter(): void {
    const sections = [
      ...document.querySelectorAll<HTMLElement>("section.letter"),
    ]
    // Measured: the bars are taller under a phone's notch and with the row of
    // letters on desktop. In the apps only their own bar is up there.
    const barsEnd = this.native
      ? Number.parseFloat(
          getComputedStyle(document.documentElement).getPropertyValue(
            "--native-chrome-top",
          ),
        ) || 0
      : (document.querySelector(".index-tools")?.getBoundingClientRect()
          .bottom ?? 0)
    const line = barsEnd + CURRENT_LETTER_MARGIN
    // The last letters are too short to reach the line: the end is the last.
    const atEnd =
      window.scrollY > 0 &&
      window.scrollY + window.innerHeight >=
        document.documentElement.scrollHeight - 2
    const current = atEnd
      ? sections.at(-1)
      : (sections
          .filter((section) => section.getBoundingClientRect().top <= line)
          .at(-1) ?? sections[0])
    this.currentLetter.set(current?.id.replace("letra-", "") ?? null)
  }

  /** The letters that have themes, for the phone's scroll bar. */
  readonly letters = computed(() => this.groups().map((g) => g.letter))

  /** A letter chosen on the phone's scroll bar. */
  scrubTo(letter: string): void {
    const dragging = this.scrubbed() !== null
    this.scrubbed.set(letter)
    const section = document.getElementById(`letra-${letter}`)
    if (!section) return
    // iOS's section index jumps, with a tick for each letter under the finger.
    if (this.native) {
      this.haptics.selection()
      this.nativeChrome.holdBars(BARS_HELD_MS)
    }
    if (this.reducedMotion() || this.native) section.scrollIntoView()
    else if (dragging) {
      this.glideTo(section, { ms: DRAG_GLIDE_MS, ease: easeOutCubic })
    } else this.glideTo(section)
  }

  /** The letter under a finger on the phone's scroll bar. */
  readonly scrubbed = signal<string | null>(null)

  /** Where the finger lifted, the keyboard carries on from, as after a tap. */
  endScrub(): void {
    const letter = this.scrubbed()
    this.scrubbed.set(null)
    if (letter) {
      document
        .querySelector<HTMLElement>(`#letra-${letter} h2`)
        ?.focus({ preventScroll: true })
    }
  }

  goToLetter(letter: string): void {
    const section = document.getElementById(`letra-${letter}`)
    if (section && this.reducedMotion()) section.scrollIntoView()
    else if (section) this.glideTo(section)
    // Or Tab carries on through the letters, and back up to the first theme.
    section?.querySelector("h2")?.focus({ preventScroll: true })
  }

  /** Scrolls to a tapped theme first, and opens it on arrival. */
  opened(slug: string, panel: MatExpansionPanel): void {
    if (this.wide() || this.slug() === slug) return
    // Material has opened it already, and closes the one before: that closing
    // goes ahead, this opening waits. Its binding opens it, in scrollTo. In the
    // apps it stays open, and the page moves as it does.
    if (!this.native) {
      panel.close()
      this.pendingOpen = slug
    }
    this.scrollSmoothly = true
    this.heldTop =
      document.getElementById(`tema-${slug}`)?.getBoundingClientRect().top ??
      null
    this.expand(slug)
  }

  closed(slug: string): void {
    if (!this.wide() && this.slug() === slug) this.expand(null)
    if (!this.native) return
    // Its title stays in sight as the reader goes down its text (the apps'
    // CSS), so closing from there puts the row back in view, under the finger.
    afterNextRender(
      () => {
        const theme = document.getElementById(`tema-${slug}`)
        if (
          theme &&
          theme.getBoundingClientRect().top <
            Number.parseFloat(getComputedStyle(theme).scrollMarginTop)
        ) {
          this.nativeChrome.holdBars(BARS_HELD_MS)
          theme.scrollIntoView()
        }
      },
      { injector: this.injector },
    )
  }

  /** Closing a long theme above moves this one, so settle it once that ends. */
  settled(slug: string): void {
    if (this.scrollTarget !== slug) return
    this.scrollTarget = null
    // A glide follows its theme as the panels settle, and isn't to restart.
    if (!this.stopGlide) this.scrollTo(slug)
  }

  /** A cross-reference opens its theme here, even if the filter hides it. */
  follow(event: MouseEvent, slug: string): void {
    if (leftToTheBrowser(event)) return
    event.preventDefault()
    this.query.set("")
    this.filterOpen.set(false)
    // Far off, as often as not: a long smooth scroll would only disorient.
    this.scrollSmoothly = false
    // A step of its own, unlike opening a theme: Back returns to the one that
    // sent the reader here.
    this.expand(slug, true)
    afterNextRender(
      () =>
        document.getElementById(`tema-${slug}`)?.focus({ preventScroll: true }),
      { injector: this.injector },
    )
  }

  /**
   * Without a navigation, as nothing leaves the page. The address follows, so
   * Back from a citation in the reader finds the theme still open.
   */
  private expand(slug: string | null, newStep = false): void {
    const url = slug ? `/indice/${slug}` : "/indice"
    if (newStep) {
      this.location.go(url)
    } else {
      this.location.replaceState(url, "", this.location.getState())
    }
    this.scrollTarget = slug
    this.show(slug)
  }

  private show(slug: string | null): void {
    this.slug.set(slug)
    this.expandedSlug.set(this.pendingOpen === slug && slug ? null : slug)
    const entry = this.entry()
    if (slug && !entry) {
      void this.router.navigate(["/indice"], { replaceUrl: true })
      return
    }
    // A theme opens at its title. Back keeps where the reader was.
    if (entry && this.router.currentNavigation()?.trigger !== "popstate") {
      afterNextRender(() => this.scrollTo(entry.slug), {
        injector: this.injector,
      })
    }
  }

  private scrollTo(slug: string): void {
    const theme = document.getElementById(`tema-${slug}`)
    if (!theme) return
    if (this.native) this.nativeChrome.holdBars(BARS_HELD_MS)
    // A theme closing above moved this one: back where the finger left it, at
    // once, so that the one scroll below starts from there.
    if (this.heldTop !== null) {
      window.scrollBy({
        top: theme.getBoundingClientRect().top - this.heldTop,
        behavior: "instant",
      })
      this.heldTop = null
    }
    const open = () => {
      if (this.pendingOpen === slug) {
        this.pendingOpen = null
        this.expandedSlug.set(slug)
      }
    }
    if (this.scrollSmoothly && !this.reducedMotion()) {
      this.glideTo(
        theme,
        this.native
          ? { arrived: open, ms: NATIVE_OPEN_MS, ease: easeOutCubic }
          : { arrived: open },
      )
    } else {
      theme.scrollIntoView()
      open()
    }
  }

  private reducedMotion(): boolean {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches
  }

  /**
   * The browser's smooth scroll is quick, at a pace of its own, so this paces
   * it. Aims anew at each frame, as the page can change under it. Any touch,
   * wheel or key outside the letters hands the page straight back to the
   * reader, though a tap on another theme drops this one's opening.
   */
  private glideTo(
    element: HTMLElement,
    options: {
      arrived?: () => void
      ms?: number
      ease?: (t: number) => number
    } = {},
  ): void {
    // Already on its way there: carries on, and arrives once.
    if (this.glidingTo === element) return
    this.stopGlide?.()
    const margin =
      Number.parseFloat(getComputedStyle(element).scrollMarginTop) || 0
    const target = () =>
      window.scrollY + element.getBoundingClientRect().top - margin
    const from = window.scrollY
    const distance = Math.abs(target() - from)
    if (distance < 1) {
      options.arrived?.()
      return
    }
    const duration =
      options.ms ?? Math.min(GLIDE_MAX_MS, GLIDE_MIN_MS + distance / 2)
    const ease = options.ease ?? easeInOutCubic
    const interruptions = ["wheel", "touchstart", "pointerdown", "keydown"]
    const stop = (arrived = true) => {
      cancelAnimationFrame(frame)
      for (const type of interruptions) {
        window.removeEventListener(type, interrupted)
      }
      this.stopGlide = undefined
      this.glidingTo = null
      if (arrived) options.arrived?.()
    }
    const interrupted = (event: Event) => {
      const on = event.target instanceof Element ? event.target : null
      if (on?.closest(".letter-bar, .letters")) return
      // The page is the reader's now: no settling back once the panels end.
      this.scrollTarget = null
      stop(!on?.closest("mat-expansion-panel-header"))
    }
    let start: number | null = null
    const step = (now: number) => {
      start ??= now
      const progress = Math.min(1, (now - start) / duration)
      window.scrollTo({
        top: from + (target() - from) * ease(progress),
        behavior: "instant",
      })
      if (progress < 1) frame = requestAnimationFrame(step)
      else stop()
    }
    let frame = requestAnimationFrame(step)
    for (const type of interruptions) {
      window.addEventListener(type, interrupted, { passive: true })
    }
    this.stopGlide = stop
    this.glidingTo = element
  }

  private textParts(part: EntryPart): TextPart[] {
    if (typeof part !== "string") return [{ text: part.text, see: part.slug }]
    if (this.booksKnown() === 0) return [{ text: part }]
    return parseReferences(this.bibleRef, part, "").map((piece, index, all) => {
      if (typeof piece === "string") return { text: piece }
      const after = all[index + 1]
      return this.citation(
        piece,
        notedVerses(piece, typeof after === "string" ? after : undefined),
      )
    })
  }

  private citation(ref: BibleReference, notes: string | null): TextPart {
    const book = this.bookService.findBook(ref.book)
    const verses = getVerseQueryParams(ref.verses, ref.crossChapter)
    return {
      text: ref.match,
      link: ["/", this.bookService.getUrlAbrv(book), ref.chapter],
      // Marked with "(n)": the reader opens that verse's notes on arrival.
      query: notes ? { ...verses, notes } : verses,
    }
  }
}
