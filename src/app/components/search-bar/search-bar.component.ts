import { Location } from "@angular/common"
import {
  Component,
  ElementRef,
  EventEmitter,
  Output,
  ViewChild,
} from "@angular/core"
import { FormsModule } from "@angular/forms"
import { MatButtonModule } from "@angular/material/button"
import { MatButtonToggleModule } from "@angular/material/button-toggle"
import { MatFormFieldModule } from "@angular/material/form-field"
import { MatIconModule } from "@angular/material/icon"
import { MatInputModule } from "@angular/material/input"
import { MatSidenavModule } from "@angular/material/sidenav"
import { MatToolbarModule } from "@angular/material/toolbar"

@Component({
  selector: "search-bar",
  imports: [
    MatToolbarModule,
    MatSidenavModule,
    MatButtonModule,
    MatIconModule,
    MatButtonToggleModule,
    MatFormFieldModule,
    FormsModule,
    MatInputModule,
  ],
  templateUrl: "./search-bar.component.html",
  styleUrls: ["./search-bar.component.css"],
})
export class SearchBarComponent {
  @Output() searchValue = new EventEmitter<string>()

  @ViewChild("searchInput", { static: false })
  searchInput!: ElementRef<HTMLInputElement>

  query = ""

  constructor(private location: Location) {}

  ngAfterViewInit(): void {
    if (this.searchInput) {
      this.searchInput.nativeElement.focus()
    }
  }

  goBack() {
    this.location.back()
  }

  emitSearch() {
    this.searchValue.emit(this.query)
  }
}
