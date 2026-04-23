import { CommonModule } from "@angular/common"
import {
  ChangeDetectorRef,
  Component,
  computed,
  DestroyRef,
  EventEmitter,
  Input,
  inject,
  type OnChanges,
  type OnDestroy,
  type OnInit,
  Output,
  type Signal,
  type SimpleChanges,
} from "@angular/core"
import { takeUntilDestroyed, toSignal } from "@angular/core/rxjs-interop"
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
import { AnalyticsService } from "../../services/analytics.service"
import { BookmarkService } from "../../services/bookmark.service"
import { NetworkService } from "../../services/network.service"
import { ShareService } from "../../services/share.service"
import { type ThemeMode, ThemeService } from "../../services/theme.service"
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

  @Output() openBookSelector = new EventEmitter<{ open: boolean }>()
  @Output() openChapterSelector = new EventEmitter<{ open: boolean }>()
  @Output() toggleAutoScrollControls = new EventEmitter<void>()
  @Output() toggleViewMode = new EventEmitter<void>()
  @Output() increaseFontSizeEvent = new EventEmitter<void>()
  @Output() decreaseFontSizeEvent = new EventEmitter<void>()

  bookLabelMode: "title" | "prompt" = "title"
  private labelInterval?: number

  currentBookmark: Bookmark | undefined
  mobile = false
  isOffline = false

  private readonly destroyRef = inject(DestroyRef)
  private readonly themeMode: Signal<ThemeMode>
  readonly themeTooltip: Signal<string>
  readonly themeIcon: Signal<string>

  constructor(
    readonly themeService: ThemeService,
    readonly shareService: ShareService,
    private readonly bookmarkService: BookmarkService,
    private readonly bottomSheet: MatBottomSheet,
    private readonly dialog: MatDialog,
    private readonly cdr: ChangeDetectorRef,
    private readonly networkService: NetworkService,
    public readonly analyticsService: AnalyticsService,
  ) {
    this.themeMode = toSignal(this.themeService.themeMode$, {
      initialValue: this.themeService.currentMode,
    })
    this.themeTooltip = computed(() => {
      switch (this.themeMode()) {
        case "light":
          return "Modo Claro"
        case "dark":
          return "Modo Escuro"
        default:
          return "Tema do Sistema"
      }
    })
    this.themeIcon = computed(() => {
      switch (this.themeMode()) {
        case "light":
          return "light_mode"
        case "dark":
          return "dark_mode"
        default:
          return "brightness_auto"
      }
    })
  }

  ngOnInit(): void {
    if (typeof window !== "undefined" && window.screen.width <= 480) {
      this.mobile = true
    }

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

  ngOnDestroy(): void {
    this.stopLabelCycle()
  }

  // ── Bookmark ───────────────────────────────────────────────────────────────

  private updateBookmarkState(): void {
    if (this.book && this.chapterNumber) {
      this.currentBookmark = this.bookmarkService.getBookmark(
        this.book.id,
        this.chapterNumber,
      )
    }
  }

  openBookmarkSelector(): void {
    if (!this.book || !this.chapterNumber) return
    this.bottomSheet.open(BookmarkSelectorComponent, {
      data: { bookId: this.book.id, chapter: this.chapterNumber },
    })
  }

  onToggleBookmarkFromMenu(trigger: MatMenuTrigger): void {
    trigger.closeMenu()
    this.openBookmarkSelector()
  }

  // ── Report problem ─────────────────────────────────────────────────────────

  onReportProblem(trigger: MatMenuTrigger): void {
    trigger.closeMenu()
    if (!this.book || !this.chapterNumber) return
    this.dialog.open(ReportProblemComponent, {
      data: { book: this.book, chapter: this.chapterNumber },
      width: "90%",
      maxWidth: "500px",
    })
  }

  // ── Navigation selectors ───────────────────────────────────────────────────

  showBookSelector(): void {
    this.openBookSelector.emit({ open: true })
  }

  showChapterSelector(): void {
    this.openChapterSelector.emit({ open: true })
  }

  // ── Auto-scroll & view mode ────────────────────────────────────────────────

  onToggleAutoScrollControls(trigger: MatMenuTrigger, event?: Event): void {
    event?.stopPropagation()
    this.toggleAutoScrollControls.emit()
    trigger.closeMenu()
  }

  onToggleViewMode(event?: Event): void {
    event?.stopPropagation()
    this.toggleViewMode.emit()
  }

  getViewModeIcon(): string {
    return this.viewMode === "scrolling" ? "swipe_vertical" : "auto_stories"
  }

  getViewModeTooltip(): string {
    return this.viewMode === "scrolling"
      ? "Modo de Deslocamento (clique para mudar para páginas)"
      : "Modo de Páginas (clique para mudar para deslocamento)"
  }

  // ── Theme ──────────────────────────────────────────────────────────────────

  onToggleTheme(event?: Event): void {
    event?.stopPropagation()
    this.themeService.toggleTheme()
  }

  // ── Font size ──────────────────────────────────────────────────────────────

  onIncreaseFontSize(event?: Event): void {
    event?.stopPropagation()
    this.increaseFontSizeEvent.emit()
  }

  onDecreaseFontSize(event?: Event): void {
    event?.stopPropagation()
    this.decreaseFontSizeEvent.emit()
  }

  // ── Share ──────────────────────────────────────────────────────────────────

  async onShare(trigger: MatMenuTrigger, event?: Event): Promise<void> {
    event?.stopPropagation()
    trigger.closeMenu()
    await this.shareService.share(this.book, this.chapterNumber)
  }

  // ── Label cycle (About page) ───────────────────────────────────────────────

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
}
