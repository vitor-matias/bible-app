import { CommonModule } from "@angular/common"
import { Component, EventEmitter, Input, Output } from "@angular/core"
import { MatListModule } from "@angular/material/list"

import { MatButtonModule } from "@angular/material/button"
import { MatIconModule } from "@angular/material/icon"
import {
  MatTreeFlatDataSource,
  MatTreeFlattener,
  MatTreeModule,
} from "@angular/material/tree"

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
    styleUrl: "./chapter-selector.component.css"
})
export class ChapterSelectorComponent {
  @Input()
  chapters: Chapter[] = []

  @Input()
  selectedChapter: Chapter["number"] = 1

  @Output() submitData = new EventEmitter<{ chapterNumber: Chapter["number"] }>()

  submit(id: Chapter["number"]) {
    this.submitData.emit({ chapterNumber: id })
  }

  onKeyPress(event: KeyboardEvent, id: Chapter["number"]): void {
    this.submit(id)
  }
}
