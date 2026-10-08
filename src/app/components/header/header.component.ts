import { CommonModule, isPlatformBrowser } from "@angular/common"
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  DestroyRef,
  EventEmitter,
  HostListener,
  Inject,
  Input,
  inject,
  type OnChanges,
  type OnDestroy,
  type OnInit,
  Output,
  PLATFORM_ID,
  type QueryList,
  type SimpleChanges,
  ViewChildren,
} from "@angular/core"
import { takeUntilDestroyed } from "@angular/core/rxjs-interop"
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
import { Capacitor } from "@capacitor/core"
import type { Share } from "@capacitor/share"
import { shareableUrl } from "../../config"
import { AnalyticsService } from "../../services/analytics.service"
import { BackButtonService } from "../../services/back-button.service"
import { BookService } from "../../services/book.service"
import { BookmarkService } from "../../services/bookmark.service"
import { NativeBookmarksService } from "../../services/native-bookmarks.service"
import {
  type NativeChromeAction,
  NativeChromeService,
} from "../../services/native-chrome.service"
import { NativeReportService } from "../../services/native-report.service"
import { NetworkService } from "../../services/network.service"
import { OnboardingService } from "../../services/onboarding.service"
import { type ThemeMode, ThemeService } from "../../services/theme.service"
import { SHARE_PLUGIN } from "../../tokens"
import { passageLabel, passageSpokenLabel } from "../../utils/passage-label"
import { buildPassagePicker } from "../../utils/passage-picker"
import { PSALMS_BOOK_ID } from "../../utils/psalms"

import { BookmarkSelectorComponent } from "../bookmark-selector/bookmark-selector.component"
import { ReportProblemComponent } from "../report-problem/report-problem.component"

/** How long each label stays on screen before the next swap. */
const LABEL_HOLD_MS = 3500
/** Fade-out half of a swap; must match the transition in the component CSS. */
const LABEL_FADE_MS = 300

const PRIVACY_POLICY_URL = "https://www.capuchinhos.org/politica-de-privacidade"

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
  @Input() book!: Book
  @Input() chapterNumber!: number
  @Input() autoScrollControlsVisible = false
  @Input() viewMode: "scrolling" | "paged" = "scrolling"
  /** For the iOS toolbar's arrows; the web page has its own. */
  @Input() canGoPrevious = false
  @Input() canGoNext = false

  bookLabelMode: "title" | "prompt" = "title"
  /** True for the fade-out half of a label swap. */
  labelFading = false

  /** Accessible name for the h1, whose visible label cycles on the home page. */
  get headingLabel(): string {
    if (!this.book) return ""
    if (this.book.id === "about") return this.book.name
    // A standalone introduction is already named after itself.
    if (this.book.introSlug) return this.book.name
    return this.chapterNumber === 0
      ? `${this.book.name} Introdução`
      : `${this.book.name} ${this.chapterNumber}`
  }
  /** Book button label; on the home page it cycles with a prompt. */
  get bookLabel(): string {
    if (this.book.id === "about" && this.bookLabelMode === "prompt") {
      return "Escolher Livro"
    }
    return this.mobile ? this.book.shortName : this.book.name
  }

  get chapterLabel(): string {
    if (this.chapterNumber !== 0) return String(this.chapterNumber)
    return this.mobile ? "Intro" : "Introdução"
  }

  readonly privacyPolicyUrl = PRIVACY_POLICY_URL

  private labelInterval?: number
  private labelSwapTimeout?: number
  canShare = false
  currentBookmark: Bookmark | undefined

  @Output() openBookSelector = new EventEmitter<{ open: boolean }>()
  @Output() openChapterSelector = new EventEmitter<{ open: boolean }>()
  @Output() toggleAutoScrollControls = new EventEmitter<void>()
  @Output() toggleViewMode = new EventEmitter<void>()
  /** iOS toolbar arrows: a page in paged mode, else a chapter. */
  @Output() previous = new EventEmitter<void>()
  @Output() next = new EventEmitter<void>()
  /** A passage chosen in the iOS picker; no chapter means the book's first. */
  @Output() selectPassage = new EventEmitter<{
    bookId: string
    chapter?: number
  }>()

  mobile = false
  isOffline = false

  private readonly destroyRef = inject(DestroyRef)
  private readonly router = inject(Router)
  private readonly nativeChrome = inject(NativeChromeService)
  private readonly bookService = inject(BookService)
  private readonly nativeBookmarks = inject(NativeBookmarksService)
  private readonly nativeReport = inject(NativeReportService)
  private bookmarks: Bookmark[] = []
  /** The iOS shell draws this header natively; the template renders nothing. */
  readonly native = this.nativeChrome.enabled
  private readonly platformId = inject(PLATFORM_ID)
  @ViewChildren(MatMenuTrigger) private menuTriggers?: QueryList<MatMenuTrigger>
  private readonly backButton = inject(BackButtonService)
  private readonly unregisterBackCloser = this.backButton.register(() => {
    const open = this.menuTriggers?.find((trigger) => trigger.menuOpen)
    open?.closeMenu()
    return !!open
  })

  constructor(
    private readonly themeService: ThemeService,
    private readonly bookmarkService: BookmarkService,
    private readonly bottomSheet: MatBottomSheet,
    private readonly dialog: MatDialog,
    private readonly cdr: ChangeDetectorRef,
    private readonly networkService: NetworkService,
    public readonly analyticsService: AnalyticsService,
    private readonly onboardingService: OnboardingService,
    @Inject(SHARE_PLUGIN) private sharePlugin: typeof Share,
  ) {}

  ngOnInit(): void {
    this.updateMobile()
    this.canShare =
      Capacitor.isNativePlatform() ||
      (typeof navigator !== "undefined" &&
        typeof navigator.share === "function")

    this.isOffline = this.networkService.isOffline
    this.networkService.isOffline$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((isOffline) => {
        this.isOffline = isOffline
        this.cdr.detectChanges()
        this.syncNativeChrome()
      })

    this.bookmarkService.bookmarks$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((bookmarks) => {
        this.bookmarks = bookmarks
        this.updateBookmarkState()
        this.cdr.detectChanges()
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
      if (this.book?.id === "about" && !this.native) {
        this.startLabelCycle()
      } else {
        this.stopLabelCycle()
      }
    }
    this.syncNativeChrome()
  }

  private updateBookmarkState() {
    // != null, not truthy: chapter 0 is the book introduction.
    if (this.book && this.chapterNumber != null) {
      this.currentBookmark = this.bookmarkService.getBookmark(
        this.book.id,
        this.chapterNumber,
      )
    }
  }

  openBookmarkSelector() {
    if (!this.book || this.chapterNumber == null) {
      return
    }
    if (this.native) {
      this.nativeBookmarks.open(this.book.id, this.chapterNumber)
      return
    }

    this.backButton.closeOnBack(
      this.bottomSheet.open(BookmarkSelectorComponent, {
        data: { bookId: this.book.id, chapter: this.chapterNumber },
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
    if (!this.book || this.chapterNumber == null) {
      return
    }
    if (this.native) {
      this.nativeReport.open(this.book, this.chapterNumber)
      return
    }

    this.dialog.open(ReportProblemComponent, {
      data: { book: this.book, chapter: this.chapterNumber },
      width: "90%",
      maxWidth: "500px",
    })
  }

  onOpenHelp(trigger: MatMenuTrigger) {
    trigger.closeMenu()
    this.onboardingService.open("menu")
  }

  ngOnDestroy(): void {
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
    if (mode === "system") return "Tema do Sistema"
    return mode === "light" ? "Modo Claro" : "Modo Escuro"
  }

  isLightTheme(): boolean {
    return this.themeService.currentMode === "light"
  }

  toggleTheme(): void {
    this.themeService.toggleTheme()
  }

  onToggleTheme(event?: Event): void {
    event?.stopPropagation()
    this.toggleTheme()
  }

  getViewModeIcon(): string {
    return this.viewMode === "scrolling" ? "swipe_vertical" : "auto_stories"
  }

  getViewModeTooltip(): string {
    return this.viewMode === "scrolling"
      ? "Modo de Deslocamento (clique para mudar para páginas)"
      : "Modo de Páginas (clique para mudar para deslocamento)"
  }

  @Output() increaseFontSizeEvent = new EventEmitter<void>()
  @Output() decreaseFontSizeEvent = new EventEmitter<void>()

  increaseFontSize(): void {
    this.increaseFontSizeEvent.emit()
  }

  onIncreaseFontSize(event?: Event): void {
    event?.stopPropagation()
    this.increaseFontSize()
  }

  decreaseFontSize(): void {
    this.decreaseFontSizeEvent.emit()
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

    const isAbout = this.book?.id === "about"
    const title = "Biblia Sagrada"
    const text = isAbout
      ? "Leia a Biblia nesta app."
      : this.chapterNumber === 0
        ? `Ler a introdução de ${this.book?.name}.`
        : `Ler ${this.book?.name} ${this.chapterNumber}.`
    const url =
      typeof window === "undefined" ? "" : shareableUrl(window.location)

    try {
      if (Capacitor.isNativePlatform()) {
        await this.sharePlugin.share({
          title: "Biblia Sagrada",
          text,
          url,
          dialogTitle: "Partilhar passagem",
        })
      } else {
        await navigator.share({ title, text, url })
      }

      // Shared successfully

      void this.analyticsService.track("share", {
        book: this.book?.id,
        chapter: this.chapterNumber,
      })
    } catch {
      // User canceled or share failed; no UI feedback needed.
    }
  }

  /** Sends what this header would show to the iOS native bars. */
  private syncNativeChrome(): void {
    if (!this.native || !this.book) return
    const isAbout = this.book.id === "about"
    // Standalone introductions and the About page have no chapters.
    const hasChapters = !isAbout && !this.book.introSlug
    this.nativeChrome.show({
      mode: "reader",
      passageLabel: !hasChapters
        ? this.bookLabel
        : this.book.id === PSALMS_BOOK_ID && this.chapterNumber > 0
          ? passageLabel(this.book, this.chapterNumber)
          : `${this.bookLabel} ${this.chapterLabel}`,
      passageAccessibilityLabel:
        hasChapters && this.chapterNumber > 0
          ? passageSpokenLabel(this.book, this.chapterNumber)
          : this.headingLabel,
      chapterNavigation: !isAbout,
      canGoPrevious: this.canGoPrevious,
      canGoNext: this.canGoNext,
      search: !this.isOffline,
      themeMode: this.themeService.currentMode,
      viewMode: isAbout ? null : this.viewMode,
      autoScrollVisible: this.autoScrollControlsVisible,
      autoScrollAvailable: this.viewMode !== "paged",
      canShare: this.canShare,
      canReport: this.analyticsService.areAnalyticsAvailable(),
    })
  }

  private onNativeAction(action: NativeChromeAction): void {
    switch (action.id) {
      case "passage":
        this.nativeChrome.showPicker(
          buildPassagePicker(this.bookService.getBooks(), this.bookmarks, {
            bookId: this.book.id,
            chapter: this.chapterNumber,
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
        this.decreaseFontSize()
        break
      case "font-increase":
        this.increaseFontSize()
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
      case "help":
        this.onboardingService.open("menu")
        break
      case "privacy":
        window.open(PRIVACY_POLICY_URL, "_blank", "noopener")
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
