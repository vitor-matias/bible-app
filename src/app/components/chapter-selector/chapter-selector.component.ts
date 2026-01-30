import { CommonModule } from "@angular/common"
import {
  AfterViewInit,
  Component,
  ElementRef,
  EventEmitter,
  Input,
  OnChanges,
  Output,
  SimpleChanges,
} from "@angular/core"
import { MatButtonModule } from "@angular/material/button"
import { MatIconModule } from "@angular/material/icon"
import { MatListModule } from "@angular/material/list"
import { MatTreeModule } from "@angular/material/tree"

@Component({
  selector: "chapter-selector",
  imports: [
    CommonModule,
    MatListModule,
    MatTreeModule,
    MatIconModule,
    MatButtonModule,
  ],
  templateUrl: "./chapter-selector.component.html",
  styleUrl: "./chapter-selector.component.css",
})
export class ChapterSelectorComponent implements AfterViewInit, OnChanges {
  @Input()
  chapters: Chapter[] = []

  @Input()
  selectedChapter: Chapter["number"] = 1

  @Output() submitData = new EventEmitter<{
    chapterNumber: Chapter["number"]
  }>()

  constructor(private elementRef: ElementRef) { }

  submit(id: Chapter["number"]) {
    this.selectedChapter = id
    this.submitData.emit({ chapterNumber: id })
  }

  onKeyPress(event: KeyboardEvent, id: Chapter["number"]): void {
    this.submit(id)
  }

  getChapterDisplay(chapter: Chapter): string {
    return chapter.number + (chapter.title ? ` - ${chapter.title}` : "")
  }

  ngAfterViewInit(): void {
    this.scrollToSelectedChapter()
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes["selectedChapter"] && !changes["selectedChapter"].firstChange) {
      setTimeout(() => this.scrollToSelectedChapter(), 100)
    }
  }

  private scrollToSelectedChapter(): void {
    const element = this.elementRef.nativeElement.querySelector(".highlight")
    if (element) {
      element.scrollIntoView({ behavior: "smooth", block: "center" })
    }
  }
}
