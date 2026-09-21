import {
  type AfterViewChecked,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  EventEmitter,
  Input,
  type OnChanges,
  Output,
  ViewChild,
} from "@angular/core"
import { RouterModule } from "@angular/router"
import type { TrailEntry } from "../../services/reading-trail.service"

/**
 * Where the reader is, and the way back through a session's reading.
 *
 * The last entry is always shown — in study mode it is the page's heading,
 * standing in for the toolbar's book/chapter chip. The steps before it appear
 * as they are made, and only then is there anything to clear.
 */
@Component({
  selector: "study-trail",
  standalone: true,
  imports: [RouterModule],
  templateUrl: "./study-trail.component.html",
  styleUrl: "./study-trail.component.css",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StudyTrailComponent implements OnChanges, AfterViewChecked {
  @Input() entries: TrailEntry[] = []
  @Output() clearTrail = new EventEmitter<void>()

  @ViewChild("list") private list?: ElementRef<HTMLElement>
  /** Set when a step is added, cleared once the list has been moved to it. */
  private followEnd = false

  /** True once there is somewhere to go back to, not merely somewhere to be. */
  get hasTrail(): boolean {
    return this.entries.length > 1
  }

  ngOnChanges(): void {
    this.followEnd = true
  }

  /**
   * Keeps the newest step in view. The trail scrolls sideways rather than
   * wrapping, so a long one would otherwise sit showing where the reader has
   * been while the step they are actually on waits off the right edge.
   */
  ngAfterViewChecked(): void {
    if (!this.followEnd) return
    const list = this.list?.nativeElement
    // domino, the DOM the app is prerendered against, has no Element.scrollTo:
    // this runs there too, on a list nothing can be scrolling.
    if (!list || typeof list.scrollTo !== "function") return
    this.followEnd = false
    list.scrollTo({
      left: list.scrollWidth,
      behavior: prefersReducedMotion() ? "auto" : "smooth",
    })
  }
}

/** A reader who has asked for less motion gets the jump, not the glide. */
function prefersReducedMotion(): boolean {
  return (
    typeof matchMedia === "function" &&
    matchMedia("(prefers-reduced-motion: reduce)").matches
  )
}
