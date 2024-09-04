import { CommonModule } from "@angular/common"
import { Component, EventEmitter, Input, type OnInit, Output } from "@angular/core"
import { MatButtonModule } from "@angular/material/button"
import { MatSidenavModule } from "@angular/material/sidenav"
import { MatToolbarModule } from "@angular/material/toolbar" // Import MatToolbarModule from the correct module
import { BookSelectorComponent } from "../book-selector/book-selector.component"

@Component({
  selector: "header",
  standalone: true,
  imports: [
    CommonModule,
    MatToolbarModule,
    MatSidenavModule,
    BookSelectorComponent,
    MatButtonModule,
  ],
  templateUrl: "./header.component.html",
  styleUrls: ["./header.component.css"],
})
export class HeaderComponent implements OnInit {
  @Input() book!: Book
  @Input() chapterNumber!: number

  @Output() openBookSelector = new EventEmitter<{ open: boolean }>()
  mobile = false

  ngOnInit(): void {
    if (window.screen.width <= 480) {
      // 768px portrait
      this.mobile = true
    }
  }

  showBookSelector() {
    this.openBookSelector.emit({ open: true })
  }
}
