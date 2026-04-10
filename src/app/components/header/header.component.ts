import { CommonModule } from "@angular/common"
import {
  ChangeDetectorRef,
  Component,
  DestroyRef,
  EventEmitter,
  Inject,
  Input,
  inject,
  type OnChanges,
  type OnDestroy,
  type OnInit,
  Output,
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
import { ThemeService } from "../../services/theme.service"
import { SHARE_PLUGIN } from "../../tokens"
import { BookmarkSelectorComponent } from "../bookmark-selector/bookmark-selector.component"
import { ReportProblemComponent } from "../report-problem/report-problem.component"

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
  styleUrls: ["./header.component.css"],
})
export class HeaderComponent implements OnInit, OnChanges, OnDestroy {
  @Input() book!: Book
  @Input() chapterNumber!: number
  @Input() autoScrollControlsVisible = false
  @Input() viewMode: "scrolling" | "paged" = "scrolling"

  bookLabelMode: "title" | "prompt" = "title"
  private labelInterval?: number
  canShare = false
  currentBookmark: Bookmark | undefined

  @Output() openBookSelector = new EventEmitter<{ open: boolean }>()
  @Output() openChapterSelector = new EventEmitter<{ open: boolean }>()
  @Output() toggleAutoScrollControls = new EventEmitter<void>()
  @Output() toggleViewMode = new EventEmitter<void>()

  mobile = false
  isOffline = false

  private readonly destroyRef = inject(DestroyRef)

  constructor(
    private readonly themeService: ThemeService,
    private readonly bookmarkService: BookmarkService,
    private readonly bottomSheet: MatBottomSheet,
    private readonly dialog: MatDialog,
    private readonly cdr: ChangeDetectorRef,
    private readonly networkService: NetworkService,
    private readonly analyticsService: AnalyticsService,
    @Inject(SHARE_PLUGIN) private sharePlugin: typeof Share,
  ) {}

  ngOnInit(): void {
    if (typeof window !== "undefined" && window.screen.width <= 480) {
      this.mobile = true
    }
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
    if (this.book && this.chapterNumber) {
      this.currentBookmark = this.bookmarkService.getBookmark(
        this.book.id,
        this.chapterNumber,
      )
    }
  }

  openBookmarkSelector() {
    if (!this.book || !this.chapterNumber) {
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
    if (!this.book || !this.chapterNumber) {
      return
    }

    this.dialog.open(ReportProblemComponent, {
      data: { book: this.book, chapter: this.chapterNumber },
      width: "90%",
      maxWidth: "500px",
    })
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
    this.labelInterval = window.setInterval(() => {
      this.bookLabelMode = this.bookLabelMode === "title" ? "prompt" : "title"
      this.cdr.detectChanges()
    }, 3500)
  }

  private stopLabelCycle(): void {
    if (this.labelInterval) {
      clearInterval(this.labelInterval)
      this.labelInterval = undefined
    }
    this.bookLabelMode = "title"
  }

  isUmamiAvailable(): boolean {
    return (
      typeof window !== "undefined" &&
      !!window.umami &&
      typeof window.umami.track === "function"
    )
  }
}
