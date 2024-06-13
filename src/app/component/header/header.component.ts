import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'header',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './header.component.html',
  styleUrls: ['./header.component.css']
})
export class HeaderComponent implements OnChanges {

  book: Book = { chapterCount: 0, id: '', name: '', shortName: '' }
  chapter: number = 1
  numbers: number[] = []

  @Input() books!: Book[]

  @Output() submitData = new EventEmitter<{ book: string; chapter: number }>()

  submit() {
    this.submitData.emit({ book: this.book.id, chapter: this.chapter })
  }

  getNumbers(count: number): number[] {
    return Array.from({ length: count }, (v, k) => k + 1);
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['books']) {
      this.book = this.books[0]
      this.chapter = 1
      this.numbers = this.getNumbers(this.book.chapterCount)
      this.submit()
    }
  }

  onBookChange(book: Book): void {
    this.chapter = 1
    this.submit()
    this.numbers = this.getNumbers(book.chapterCount)
  }

  onChapterChange(chapterNumber: Chapter['number']): void {
    this.chapter = chapterNumber
    this.submit()
  }
}
