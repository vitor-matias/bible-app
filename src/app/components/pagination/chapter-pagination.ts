import { CommonModule } from "@angular/common"
import {
  ChangeDetectionStrategy,
  Component,
  type ElementRef,
  EventEmitter,
  Input,
  Output,
  ViewChild,
} from "@angular/core"
import { MatToolbarModule } from "@angular/material/toolbar"
import { NgbPaginationModule } from "@ng-bootstrap/ng-bootstrap"

const FILTER_PAG_REGEX = /[^0-9]/g

@Component({
  selector: "chapter-pagination",
  imports: [CommonModule, MatToolbarModule, NgbPaginationModule],
  templateUrl: "./chapter-pagination.html",
  styleUrl: "./chapter-pagination.css",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChapterPagination {
  @ViewChild("i")
  input!: ElementRef

  @Input()
  chapter!: number

  @Input()
  totalChapters!: number

  @Output() chapterEmiter = new EventEmitter<{ chapter: number }>()

  emitChapter() {
    this.chapterEmiter.emit({ chapter: this.chapter })
  }

  selectPage(page: string) {
    this.chapter = Number.parseInt(page, 10) || 1
    this.emitChapter()
    this.input.nativeElement.blur()
  }

  formatInput(input: HTMLInputElement) {
    input.value = input.value.replace(FILTER_PAG_REGEX, "")
  }
}
