import { CommonModule } from "@angular/common"
import { Component, Input } from "@angular/core"

@Component({
  selector: "verse-section",
  imports: [CommonModule],
  templateUrl: "./verse-section.component.html",
  styleUrl: "./verse-section.component.css",
})
export class VerseSectionComponent {
  @Input()
  data!: Verse

  @Input()
  changeLine!: boolean
}
