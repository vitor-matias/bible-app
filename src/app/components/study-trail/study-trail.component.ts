import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  Output,
} from "@angular/core"
import { RouterModule } from "@angular/router"
import type { TrailEntry } from "../../services/reading-trail.service"

/**
 * The way back through a session's reading.
 *
 * Hidden until there is somewhere to go back to: a breadcrumb showing only
 * where you already are is a line of chrome that says nothing.
 */
@Component({
  selector: "study-trail",
  standalone: true,
  imports: [RouterModule],
  templateUrl: "./study-trail.component.html",
  styleUrl: "./study-trail.component.css",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StudyTrailComponent {
  @Input() entries: TrailEntry[] = []
  @Output() clearTrail = new EventEmitter<void>()

  get hasTrail(): boolean {
    return this.entries.length > 1
  }
}
