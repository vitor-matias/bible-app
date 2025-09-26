import { CommonModule } from "@angular/common"
import {
  Component,
  EventEmitter,
  Input,
  type OnInit,
  Output,
} from "@angular/core"
import { MatButtonModule } from "@angular/material/button"
import { MatButtonToggleModule } from "@angular/material/button-toggle"
import { MatIconModule } from "@angular/material/icon"
import { MatSidenavModule } from "@angular/material/sidenav"
import { MatToolbarModule } from "@angular/material/toolbar" // Import MatToolbarModule from the correct module
import { type Router, RouterModule } from "@angular/router"
import { ThemeService } from "../../services/theme.service"

@Component({
  selector: "header",
  imports: [
    CommonModule,
    MatToolbarModule,
    MatSidenavModule,
    MatButtonModule,
    MatIconModule,
    MatButtonToggleModule,
    RouterModule,
  ],
  templateUrl: "./header.component.html",
  styleUrls: ["./header.component.css"],
})
export class HeaderComponent implements OnInit {


  @Input() book!: Book
  @Input() chapterNumber!: number

  @Output() openBookSelector = new EventEmitter<{ open: boolean }>()
  @Output() openChapterSelector = new EventEmitter<{ open: boolean }>()

  mobile = false

  constructor(private themeService: ThemeService) {}

  ngOnInit(): void {
    if (window.screen.width <= 480) {
      // 768px portrait
      this.mobile = true
    }
  }

  showBookSelector() {
    this.openBookSelector.emit({ open: true })
  }

  showChapterSelector() {
    this.openChapterSelector.emit({ open: true })
  }

  isLightTheme(): boolean {
    return localStorage.getItem("theme") === "light";
  }

  toggleTheme(): void {
    this.themeService.toggleTheme();
  }
}
