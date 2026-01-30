import {
  ChangeDetectorRef,
  Component,
  EventEmitter,
  Input,
  type OnChanges,
  type OnDestroy,
  type OnInit,
  Output,
  type SimpleChanges,
} from "@angular/core"
import { MatButtonModule } from "@angular/material/button"
import { MatButtonToggleModule } from "@angular/material/button-toggle"
import { MatIconModule } from "@angular/material/icon"
import { MatMenuModule, type MatMenuTrigger } from "@angular/material/menu"
import { MatSidenavModule } from "@angular/material/sidenav"
import { MatToolbarModule } from "@angular/material/toolbar"
import { MatTooltipModule } from "@angular/material/tooltip"
import { RouterModule } from "@angular/router"
import { ThemeService } from "../../services/theme.service"
import { PreferencesService } from "../../services/preferences.service"

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
  ],
  templateUrl: "./header.component.html",
  styleUrls: ["./header.component.css"],
})
export class HeaderComponent implements OnInit, OnChanges, OnDestroy {
  @Input() book!: Book
  @Input() chapterNumber!: number
  @Input() autoScrollControlsVisible = false

  bookLabelMode: "title" | "prompt" = "title"
  private labelInterval?: number
  canShare = false

  @Output() openBookSelector = new EventEmitter<{ open: boolean }>()
  @Output() openChapterSelector = new EventEmitter<{ open: boolean }>()
  @Output() toggleAutoScrollControls = new EventEmitter<void>()

  mobile = false
  isOffline = typeof navigator !== "undefined" ? !navigator.onLine : false

  constructor(
    private readonly themeService: ThemeService,
    private readonly preferencesService: PreferencesService,
    private readonly cdr: ChangeDetectorRef,
  ) { }

  ngOnInit(): void {
    if (window.screen.width <= 480) {
      // 768px portrait
      this.mobile = true
    }
    this.canShare =
      typeof navigator !== "undefined" && typeof navigator.share === "function"
    if (typeof window !== "undefined") {
      window.addEventListener("online", this.updateOnlineStatus)
      window.addEventListener("offline", this.updateOnlineStatus)
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
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
    if (typeof window !== "undefined") {
      window.removeEventListener("online", this.updateOnlineStatus)
      window.removeEventListener("offline", this.updateOnlineStatus)
    }
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

  isLightTheme(): boolean {
    return this.preferencesService.getTheme() === "light"
  }

  toggleTheme(): void {
    this.themeService.toggleTheme()
  }

  onToggleTheme(event?: Event): void {
    event?.stopPropagation()
    this.toggleTheme()
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
    const url = globalThis.window === undefined ? "" : globalThis.location.href

    try {
      await navigator.share({ title, text, url }).finally(() => {
        // Shared successfully
        // @ts-expect-error
        if (globalThis.umami) {
          // @ts-expect-error
          globalThis.umami.track("share", {
            book: this.book?.id,
            chapter: this.chapterNumber,
          })
        }
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



  private updateOnlineStatus = () => {
    this.isOffline =
      typeof navigator !== "undefined" ? !navigator.onLine : false
    this.cdr.detectChanges()
  }
}
