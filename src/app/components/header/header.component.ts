import {
  type ChangeDetectorRef,
  Component,
  EventEmitter,
  Input,
  type OnInit,
  Output,
  type SimpleChanges,
} from "@angular/core"
import { MatButtonModule } from "@angular/material/button"
import { MatButtonToggleModule } from "@angular/material/button-toggle"
import { MatIconModule } from "@angular/material/icon"
import { MatSidenavModule } from "@angular/material/sidenav"
import { MatToolbarModule } from "@angular/material/toolbar"
import { MatTooltipModule } from "@angular/material/tooltip"
import { type Router, RouterModule } from "@angular/router"
import type { ThemeService } from "../../services/theme.service"

@Component({
  selector: "header",
  imports: [
    MatToolbarModule,
    MatSidenavModule,
    MatButtonModule,
    MatIconModule,
    MatButtonToggleModule,
    RouterModule,
    MatTooltipModule,
  ],
  templateUrl: "./header.component.html",
  styleUrls: ["./header.component.css"],
})
export class HeaderComponent implements OnInit {
  @Input() book!: Book
  @Input() chapterNumber!: number

  bookLabelMode: "title" | "prompt" = "title"
  private labelInterval?: number

  @Output() openBookSelector = new EventEmitter<{ open: boolean }>()
  @Output() openChapterSelector = new EventEmitter<{ open: boolean }>()

  mobile = false

  constructor(
    private themeService: ThemeService,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    if (window.screen.width <= 480) {
      // 768px portrait
      this.mobile = true
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
  }

  showBookSelector() {
    this.openBookSelector.emit({ open: true })
  }

  showChapterSelector() {
    this.openChapterSelector.emit({ open: true })
  }

  isLightTheme(): boolean {
    return localStorage.getItem("theme") === "light"
  }

  toggleTheme(): void {
    this.themeService.toggleTheme()
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
}
