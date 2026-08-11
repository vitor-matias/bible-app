import { ChangeDetectionStrategy, Component } from "@angular/core"
import { BookIndexComponent } from "../book-index/book-index.component"

@Component({
  selector: "about",
  imports: [BookIndexComponent],
  templateUrl: "./about.component.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: "./about.component.css",
})
export class AboutComponent {}
