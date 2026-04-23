import { Location } from "@angular/common"
import {
  Component,
  type ElementRef,
  EventEmitter,
  Input,
  OnInit,
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
export class SearchBarComponent implements OnInit {
  @Input() initialQuery = ""
  @Output() searchValue = new EventEmitter<string>()

  @ViewChild("searchInput", { static: false })
  searchInput!: ElementRef<HTMLInputElement>

  query = ""

  constructor(private location: Location) {}

  ngOnInit(): void {
    this.query = this.initialQuery
  }

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
