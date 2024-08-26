import { CommonModule } from "@angular/common"
import { Component, EventEmitter, Input, Output } from "@angular/core"
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
  ],
  templateUrl: "./header.component.html",
  styleUrls: ["./header.component.css"],
})
export class HeaderComponent {
  @Input() book!: Book

  @Output() openBookSelector = new EventEmitter<{ open: boolean }>()

  showBookSelector() {
    this.openBookSelector.emit({ open: true })
  }
}
