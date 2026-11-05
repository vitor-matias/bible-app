import { CommonModule, DOCUMENT, isPlatformBrowser } from "@angular/common"
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  DestroyRef,
  HostListener,
  inject,
  input,
  type OnChanges,
  type OnDestroy,
  type OnInit,
  output,
  PLATFORM_ID,
  type QueryList,
  type SimpleChanges,
  ViewChildren,
} from "@angular/core"
import { takeUntilDestroyed, toSignal } from "@angular/core/rxjs-interop"
import { MatBottomSheet } from "@angular/material/bottom-sheet"
import { MatButtonModule } from "@angular/material/button"
import { MatButtonToggleModule } from "@angular/material/button-toggle"
import { MatDialog } from "@angular/material/dialog"
import { MatDividerModule } from "@angular/material/divider"
import { MatIconModule } from "@angular/material/icon"
import { MatMenuModule, MatMenuTrigger } from "@angular/material/menu"
import { MatSidenavModule } from "@angular/material/sidenav"
import { MatToolbarModule } from "@angular/material/toolbar"
import { MatTooltipModule } from "@angular/material/tooltip"
import { Router, RouterModule } from "@angular/router"
import { shareableUrl } from "../../config"
import type { TextSize } from "../../directives/unified-gesture.directive"
import { AnalyticsService } from "../../services/analytics.service"
import { BackButtonService } from "../../services/back-button.service"
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
import { NativeBookmarksService } from "../../services/native-bookmarks.service"
import { NativeChromeService } from "../../services/native-chrome.service"
import type { NativeChromeAction } from "../../services/native-chrome.types"
import { NativeReportService } from "../../services/native-report.service"
import { OnboardingService } from "../../services/onboarding.service"
import { PwaInstallService } from "../../services/pwa-install.service"
import { type ThemeMode, ThemeService } from "../../services/theme.service"
import {
  passageLabel,
  passageShortLabels,
  passageSpokenLabel,
} from "../../utils/passage-label"
import { buildPassagePicker } from "../../utils/passage-picker"
import { PSALMS_BOOK_ID } from "../../utils/psalms"

import { BookmarkSelectorComponent } from "../bookmark-selector/bookmark-selector.component"
import {
  PRIVACY_DIALOG_CONFIG,
  PrivacyPolicyDialogComponent,
} from "../privacy-policy/privacy-policy.component"
import { ReportProblemComponent } from "../report-problem/report-problem.component"

/** How long each label stays on screen before the next swap. */
const LABEL_HOLD_MS = 3500
/** Fade-out half of a swap; must match the transition in the component CSS. */
const LABEL_FADE_MS = 300

@Component({
  standalone: true,
  selector: "header",
  imports: [
    MatToolbarModule,
    MatSidenavModule,
    MatButtonModule,
    MatIconModule,
    MatButtonToggleModule,
    MatMenuModule,
    RouterModule,
    MatTooltipModule,
    MatDividerModule,
    CommonModule,
  ],
  templateUrl: "./header.component.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrls: ["./header.component.css"],
})
export class HeaderComponent implements OnInit, OnChanges, OnDestroy {
  private readonly themeService = inject(ThemeService)
  private readonly bookmarkService = inject(BookmarkService)
  private readonly bottomSheet = inject(MatBottomSheet)
  private readonly dialog = inject(MatDialog)
  private readonly cdr = inject(ChangeDetectorRef)
  readonly analyticsService = inject(AnalyticsService)
  private readonly onboardingService = inject(OnboardingService)
  private readonly pwaInstallService = inject(PwaInstallService)
  /** Browsers that can't prompt (iOS, Firefox) get the tutorial's steps instead. */
  readonly canInstall = toSignal(this.pwaInstallService.canPromptInstall$, {
    requireSync: true,
  })

  readonly book = input.required<Book>()
  readonly chapterNumber = input.required<number>()
  readonly autoScrollControlsVisible = input(false)
  /** The reader's text size, for the Android app's text sheet; null before it opens. */
  readonly textSize = input<TextSize | null>(null)
  readonly viewMode = input<"scrolling" | "paged">("scrolling")
  /** For the native toolbar's arrows; the web page has its own. */
  readonly canGoPrevious = input(false)
  readonly canGoNext = input(false)

  bookLabelMode: "title" | "prompt" = "title"
  /** True for the fade-out half of a label swap. */
  labelFading = false

  /** Accessible name for the h1, whose visible label cycles on the home page. */
  get headingLabel(): string {
    const book = this.book()
    if (!book) return ""
    if (book.id === "about") return book.name
    // A standalone introduction is already named after itself.
    if (book.introSlug) return book.name
    const chapterNumber = this.chapterNumber()
    return chapterNumber === 0
      ? `${book.name} Introdução`
      : `${book.name} ${chapterNumber}`
  }
  /** Book button label; on the home page it cycles with a prompt. */
  get bookLabel(): string {
    const book = this.book()
    if (book.id === "about" && this.bookLabelMode === "prompt") {
      return "Escolher Livro"
    }
    return this.mobile ? book.shortName : book.name
  }

  get chapterLabel(): string {
    const chapterNumber = this.chapterNumber()
    if (chapterNumber !== 0) return String(chapterNumber)
    return this.mobile ? "Intro" : "Introdução"
  }

  /** Small print under the menu's last item; null until it is known. */
  version: DisplayVersion | null = null
  private destroyed = false

  private labelInterval?: number
  private labelSwapTimeout?: number
  canShare = false
  currentBookmark: Bookmark | undefined
  /** The ribbon's tone; on the header's antique-white button in both themes. */
  readonly ribbonColor = ribbonColor

  readonly openBookSelector = output<{
    open: boolean
  }>()
  readonly openChapterSelector = output<{
    open: boolean
  }>()
  readonly toggleAutoScrollControls = output<void>()
  readonly toggleViewMode = output<void>()
  /** iOS toolbar arrows: a page in paged mode, else a chapter. */
  readonly previous = output<void>()
  readonly next = output<void>()
  /** A passage chosen in the native picker or menu; no chapter means the book's first. */
  readonly selectPassage = output<{
    bookId: string
    chapter?: number
  }>()

  mobile = false

  private readonly destroyRef = inject(DestroyRef)
  private readonly router = inject(Router)
  private readonly nativeChrome = inject(NativeChromeService)
  private readonly bookService = inject(BookService)
  private readonly nativeBookmarks = inject(NativeBookmarksService)
  private readonly nativeReport = inject(NativeReportService)
  private readonly buildVersion = inject(BuildVersionService)
  private bookmarks: Bookmark[] = []
  /** The native shells draw this header; the template renders nothing. */
  readonly native = this.nativeChrome.enabled
  private readonly platformId = inject(PLATFORM_ID)
  private readonly document = inject(DOCUMENT)
  @ViewChildren(MatMenuTrigger)
  private menuTriggers?: QueryList<MatMenuTrigger>
  private readonly backButton = inject(BackButtonService)
  private readonly unregisterBackCloser = this.backButton.register(() => {
    const open = this.menuTriggers?.find((trigger) => trigger.menuOpen)
    open?.closeMenu()
    return !!open
  })

  /**
   * Initializes responsive and sharing state, follows bookmark changes, and
   * connects the native bars. Loads the menu version asynchronously, ignoring
   * it if this header has already been destroyed.
   */
  ngOnInit(): void {
    this.updateMobile()
    this.canShare =
      this.native ||
      (typeof navigator !== "undefined" &&
        typeof navigator.share === "function")

    this.bookmarkService.bookmarks$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((bookmarks) => {
        this.bookmarks = bookmarks
        this.updateBookmarkState()
        this.cdr.detectChanges()
        this.syncNativeChrome()
      })

    // The native shell draws the menu: it gets the timestamp, and has the release.
    void this.buildVersion.getDisplayVersion().then((version) => {
      // Gone already: syncing now would put the bars back over another page.
      if (this.destroyed) return
      this.version = version
      this.cdr.markForCheck()
      this.syncNativeChrome()
    })

    if (this.native) {
      this.nativeChrome.actions$
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe((action) => this.onNativeAction(action))
      this.syncNativeChrome()
    }
  }

  /** Window width, not screen width: a narrow desktop window counts too. */
  @HostListener("window:resize")
  updateMobile(): void {
    if (typeof window === "undefined") return
    const isMobile = window.innerWidth <= 480
    if (isMobile !== this.mobile) {
      this.mobile = isMobile
      this.cdr.markForCheck()
      this.syncNativeChrome()
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes["book"] || changes["chapterNumber"]) {
      this.updateBookmarkState()
    }
    if (changes["book"]) {
      // The native bar has no room for the prompt; its button is plainly one.
      if (this.book()?.id === "about" && !this.native) {
        this.startLabelCycle()
      } else {
        this.stopLabelCycle()
      }
    }
    this.syncNativeChrome()
  }

  private updateBookmarkState() {
    // != null, not truthy: chapter 0 is the book introduction.
    const book = this.book()
    if (book && this.chapterNumber() != null) {
      this.currentBookmark = this.bookmarkService.getBookmark(
        book.id,
        this.chapterNumber(),
      )
    }
  }

  openBookmarkSelector() {
    const book = this.book()
    const chapterNumber = this.chapterNumber()
    if (!book || chapterNumber == null) {
      return
    }
    if (this.native) {
      this.nativeBookmarks.open(book.id, chapterNumber)
      return
    }

    this.backButton.closeOnBack(
      this.bottomSheet.open(BookmarkSelectorComponent, {
        data: { bookId: book.id, chapter: chapterNumber },
      }),
    )
  }

  onToggleBookmarkFromMenu(trigger: MatMenuTrigger) {
    trigger.closeMenu()
    this.openBookmarkSelector()
  }

  onReportProblem(trigger: MatMenuTrigger) {
    trigger.closeMenu()
    this.openReportProblem()
  }

  openReportProblem() {
    const book = this.book()
    const chapterNumber = this.chapterNumber()
    if (!book || chapterNumber == null) {
      return
    }
    if (this.native) {
      this.nativeReport.open(book, chapterNumber)
      return
    }

    this.dialog.open(ReportProblemComponent, {
      data: { book, chapter: chapterNumber },
      width: "90%",
      maxWidth: "500px",
    })
  }

  onOpenAbout(trigger: MatMenuTrigger) {
    trigger.closeMenu()
    this.openAbout()
  }

  onOpenPrivacyPolicy(trigger: MatMenuTrigger) {
    trigger.closeMenu()
    this.openPrivacyPolicy()
  }

  private openPrivacyPolicy(): void {
    this.dialog.open(PrivacyPolicyDialogComponent, PRIVACY_DIALOG_CONFIG)
  }

  /** The About page, which the book pickers no longer list. */
  private openAbout(): void {
    this.selectPassage.emit({ bookId: "about" })
  }

  onOpenHelp(trigger: MatMenuTrigger) {
    trigger.closeMenu()
    this.onboardingService.open("menu")
  }

  async onInstall(trigger: MatMenuTrigger): Promise<void> {
    trigger.closeMenu()
    const outcome = await this.pwaInstallService.promptInstall()
    // AnalyticsService.track overwrites `platform`, hence the distinct key.
    void this.analyticsService.track("pwa_install_prompt", {
      outcome,
      installPlatform: this.pwaInstallService.detectPlatform(),
    })
  }

  /**
   * Ignores a late version result, unregisters the back handler, stops label
   * cycling, and requests that the native bars hide.
   */
  ngOnDestroy(): void {
    this.destroyed = true
    this.unregisterBackCloser()
    this.stopLabelCycle()
    if (this.native) this.nativeChrome.hide()
  }

  showBookSelector() {
    this.openBookSelector.emit({ open: true })
  }

  showChapterSelector() {
    this.openChapterSelector.emit({ open: true })
  }

  onToggleAutoScrollControls(trigger: MatMenuTrigger, event?: Event): void {
    event?.stopPropagation()
    this.toggleAutoScrollControls.emit()
    trigger.closeMenu()
  }

  onToggleViewMode(event?: Event): void {
    event?.stopPropagation()
    this.toggleViewMode.emit()
  }

  getThemeIcon(): string {
    const mode = this.themeService.currentMode
    if (mode === "system") return "brightness_auto"
    return mode === "light" ? "light_mode" : "dark_mode"
  }

  getThemeTooltip(): string {
    const mode = this.themeService.currentMode
    // Says which theme is on: the button cycles through them.
    if (mode === "system") return "Tema: Automático"
    return mode === "light" ? "Tema: Claro" : "Tema: Escuro"
  }

  /**
   * One button cycles through the three themes. The menu stays open, so the
   * page changes theme behind it and the icon shows the new one.
   */
  onToggleTheme(): void {
    this.themeService.toggleTheme()
    this.cdr.detectChanges()
  }

  /** The ribbon on the chapter being read, by its spoken name ("Vermelho"). */
  get bookmarkName(): string | undefined {
    const color = this.currentBookmark?.color
    return color ? spokenRibbonName(color) : undefined
  }

  getViewModeIcon(): string {
    return this.viewMode() === "scrolling" ? "swipe_vertical" : "auto_stories"
  }

  getViewModeTooltip(): string {
    return this.viewMode() === "scrolling"
      ? "Texto contínuo (clique para mudar para página a página)"
      : "Página a página (clique para mudar para texto contínuo)"
  }

  /** A size up or down; a `step` (percent) where the native sheet asks for one. */
  readonly increaseFontSizeEvent = output<number | undefined>()
  readonly decreaseFontSizeEvent = output<number | undefined>()
  /** Back to the size the text opens at without a choice. */
  readonly resetFontSizeEvent = output<void>()

  increaseFontSize(): void {
    this.increaseFontSizeEvent.emit(undefined)
  }

  onIncreaseFontSize(event?: Event): void {
    event?.stopPropagation()
    this.increaseFontSize()
  }

  decreaseFontSize(): void {
    this.decreaseFontSizeEvent.emit(undefined)
  }

  onDecreaseFontSize(event?: Event): void {
    event?.stopPropagation()
    this.decreaseFontSize()
  }

  async onShare(trigger: MatMenuTrigger, event?: Event): Promise<void> {
    event?.stopPropagation()
    trigger.closeMenu()
    await this.sharePassage()
  }

  async sharePassage(): Promise<void> {
    if (!this.canShare) {
      return
    }

    const book = this.book()
    const isAbout = book?.id === "about"
    const title = "Bíblia Sagrada"
    const chapterNumber = this.chapterNumber()
    const text = isAbout
      ? "Leia a Bíblia nesta app."
      : chapterNumber === 0
        ? `Ler a introdução de ${book?.name}.`
        : `Ler ${book?.name} ${chapterNumber}.`
    const url =
      typeof window === "undefined" ? "" : shareableUrl(window.location)

    try {
      if (this.native) {
        // The page's title heads the preview, as iOS would fetch it.
        const shared = await this.nativeChrome.share({
          title,
          text,
          url,
          linkTitle: this.document.title || title,
        })
        if (!shared) return
      } else {
        await navigator.share({ title, text, url })
      }

      // Shared successfully

      void this.analyticsService.track("share", {
        book: book?.id,
        chapter: this.chapterNumber(),
      })
    } catch {
      // User canceled or share failed; no UI feedback needed.
    }
  }

  /** Sends what this header would show to the native bars. */
  private syncNativeChrome(): void {
    const book = this.book()
    if (!this.native || !book) return
    const isAbout = book.id === "about"
    // Standalone introductions and the About page have no chapters.
    const hasChapters = !isAbout && !book.introSlug
    const label = !hasChapters
      ? this.bookLabel
      : book.id === PSALMS_BOOK_ID && this.chapterNumber() > 0
        ? passageLabel(book, this.chapterNumber())
        : `${this.bookLabel} ${this.chapterLabel}`
    this.nativeChrome.show({
      mode: "reader",
      passageLabel: label,
      passageShortLabels: hasChapters
        ? passageShortLabels(book, this.chapterNumber())
        : [],
      passageAccessibilityLabel: [
        hasChapters && this.chapterNumber() > 0
          ? passageSpokenLabel(book, this.chapterNumber())
          : this.headingLabel,
        ...(this.bookmarkName
          ? [`marcador ${this.bookmarkName.toLocaleLowerCase("pt")}`]
          : []),
      ].join(", "),
      bookmarkColor: this.currentBookmark?.color ?? null,
      bookmarkName: this.bookmarkName?.toLocaleLowerCase("pt") ?? null,
      chapterNavigation: !isAbout,
      canGoPrevious: this.canGoPrevious(),
      canGoNext: this.canGoNext(),
      // Offline too: references open from the stored Bible, and words are
      // searched in it (OfflineSearchService).
      search: true,
      themeMode: this.themeService.currentMode,
      viewMode: isAbout ? null : this.viewMode(),
      autoScrollVisible: this.autoScrollControlsVisible(),
      autoScrollAvailable: this.viewMode() !== "paged",
      canShare: this.canShare,
      canReport: this.analyticsService.areAnalyticsAvailable(),
      buildVersion: this.version?.build ?? null,
      textSize: isAbout ? null : this.textSize(),
    })
  }

  private onNativeAction(action: NativeChromeAction): void {
    switch (action.id) {
      case "passage":
        this.nativeChrome.showPicker(
          buildPassagePicker(this.bookService.getBooks(), this.bookmarks, {
            bookId: this.book().id,
            chapter: this.chapterNumber(),
          }),
        )
        break
      case "goto":
        this.selectPassage.emit({
          bookId: action.bookId,
          chapter: action.chapter,
        })
        break
      case "previous":
        this.previous.emit()
        break
      case "next":
        this.next.emit()
        break
      case "search":
        void this.router.navigate(["/search"])
        break
      case "theme-system":
      case "theme-light":
      case "theme-dark":
        this.themeService.setTheme(
          action.id.slice("theme-".length) as ThemeMode,
        )
        this.syncNativeChrome()
        break
      case "view-mode":
        this.toggleViewMode.emit()
        break
      case "font-decrease":
        this.decreaseFontSizeEvent.emit(action.step)
        break
      case "font-increase":
        this.increaseFontSizeEvent.emit(action.step)
        break
      case "font-reset":
        this.resetFontSizeEvent.emit()
        break
      case "bookmarks":
        this.openBookmarkSelector()
        break
      case "auto-scroll":
        this.toggleAutoScrollControls.emit()
        break
      case "share":
        void this.sharePassage()
        break
      case "report":
        this.openReportProblem()
        break
      case "about":
        this.openAbout()
        break
      case "help":
        this.onboardingService.open("menu")
        break
      case "privacy":
        this.openPrivacyPolicy()
        break
    }
  }

  private startLabelCycle(): void {
    this.stopLabelCycle()
    this.bookLabelMode = "title"
    // Browser-only: there is no window while prerendering the home page.
    if (!isPlatformBrowser(this.platformId)) return
    this.labelInterval = window.setInterval(() => {
      // Fade out, swap the text while it is invisible, then fade back in.
      this.labelFading = true
      this.cdr.detectChanges()

      this.labelSwapTimeout = window.setTimeout(() => {
        this.bookLabelMode = this.bookLabelMode === "title" ? "prompt" : "title"
        this.labelFading = false
        this.labelSwapTimeout = undefined
        this.cdr.detectChanges()
      }, LABEL_FADE_MS)
    }, LABEL_HOLD_MS)
  }

  private stopLabelCycle(): void {
    if (this.labelInterval) {
      clearInterval(this.labelInterval)
      this.labelInterval = undefined
    }
    if (this.labelSwapTimeout) {
      clearTimeout(this.labelSwapTimeout)
      this.labelSwapTimeout = undefined
    }
    this.bookLabelMode = "title"
    this.labelFading = false
  }
}
