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
  type SimpleChanges,
} from "@angular/core"
import { takeUntilDestroyed } from "@angular/core/rxjs-interop"
import { MatBottomSheet } from "@angular/material/bottom-sheet"
import { MatButtonModule } from "@angular/material/button"
import { MatButtonToggleModule } from "@angular/material/button-toggle"
import { MatDialog } from "@angular/material/dialog"
import { MatDividerModule } from "@angular/material/divider"
import { MatIconModule } from "@angular/material/icon"
import { MatMenuModule, type MatMenuTrigger } from "@angular/material/menu"
import { MatSidenavModule } from "@angular/material/sidenav"
import { MatToolbarModule } from "@angular/material/toolbar"
import { MatTooltipModule } from "@angular/material/tooltip"
import { RouterModule } from "@angular/router"
import { Capacitor } from "@capacitor/core"
import type { Share } from "@capacitor/share"
import { AnalyticsService } from "../../services/analytics.service"
import { BookmarkService } from "../../services/bookmark.service"
import { NetworkService } from "../../services/network.service"
import { OnboardingService } from "../../services/onboarding.service"
import { ThemeService } from "../../services/theme.service"
import { SHARE_PLUGIN } from "../../tokens"

import { BookmarkSelectorComponent } from "../bookmark-selector/bookmark-selector.component"
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
  @Input() book!: Book
  @Input() chapterNumber!: number
  @Input() autoScrollControlsVisible = false
  @Input() viewMode: "scrolling" | "paged" = "scrolling"

  bookLabelMode: "title" | "prompt" = "title"
  /** True for the fade-out half of a label swap. */
  labelFading = false

  /**
   * Accessible name for the page heading. The visible label doubles as the
   * book picker and, on the home page, alternates with a prompt — this keeps
   * the heading naming the page whatever it currently shows.
   */
  get headingLabel(): string {
    if (!this.book) return ""
    if (this.book.id === "about") return this.book.name
    // Chapter 0 is the introduction, and a standalone one is already named
    // after itself — same rules the visible label follows, so the heading
    // never announces "0" for a page that shows "Introdução".
    if (this.book.introSlug) return this.book.name
    return this.chapterNumber === 0
      ? `${this.book.name} Introdução`
      : `${this.book.name} ${this.chapterNumber}`
  }
  private labelInterval?: number
  private labelSwapTimeout?: number
  canShare = false
  currentBookmark: Bookmark | undefined

  @Output() openBookSelector = new EventEmitter<{ open: boolean }>()
  @Output() openChapterSelector = new EventEmitter<{ open: boolean }>()
  @Output() toggleAutoScrollControls = new EventEmitter<void>()
  @Output() toggleViewMode = new EventEmitter<void>()

  mobile = false
  isOffline = false

  private readonly destroyRef = inject(DestroyRef)
  private readonly platformId = inject(PLATFORM_ID)

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
      })

    this.bookmarkService.bookmarks$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.updateBookmarkState()
        this.cdr.detectChanges()
      })
  }

  /**
   * Width of the window, not of the physical screen: a narrow desktop window
   * needs the compact labels just as much as a phone does. Recomputed on
   * resize so rotating or resizing takes effect immediately.
   */
  @HostListener("window:resize")
  updateMobile(): void {
    if (typeof window === "undefined") return
    const isMobile = window.innerWidth <= 480
    if (isMobile !== this.mobile) {
      this.mobile = isMobile
      this.cdr.markForCheck()
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes["book"] || changes["chapterNumber"]) {
      this.updateBookmarkState()
    }
    if (changes["book"]) {
      if (this.book?.id === "about") {
        this.startLabelCycle()
      } else {
        this.stopLabelCycle()
      }
    }
  }

  private updateBookmarkState() {
    // chapterNumber 0 is the book introduction, so check for null instead of falsiness
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

    this.bottomSheet.open(BookmarkSelectorComponent, {
      data: { bookId: this.book.id, chapter: this.chapterNumber },
    })
  }

  onToggleBookmarkFromMenu(trigger: MatMenuTrigger) {
    trigger.closeMenu()
    this.openBookmarkSelector()
  }

  onReportProblem(trigger: MatMenuTrigger) {
    trigger.closeMenu()
    // != null, not falsy: chapter 0 is the introduction, and a reader looking
    // at one must still be able to report a problem with it.
    if (!this.book || this.chapterNumber == null) {
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
    this.stopLabelCycle()
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
    const url = typeof window === "undefined" ? "" : window.location.href

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

  private startLabelCycle(): void {
    this.stopLabelCycle()
    this.bookLabelMode = "title"
    // The cycling label is browser-only chrome: while prerendering the home
    // page (about book) there is no window, and window.setInterval here
    // crashed every server render of "/".
    if (!isPlatformBrowser(this.platformId)) return
    this.labelInterval = window.setInterval(() => {
      // Two phases against the one element on screen: fade it out, swap the
      // text while nothing is visible, then let it fade back in. The old
      // crossfade needed a second element for this, and that second label
      // counted as part of the page's h1.
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
