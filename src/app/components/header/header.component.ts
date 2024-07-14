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

  @Input() books!: Book[]

  @Output() submitData = new EventEmitter<{ book: Book['id'] }>()

  submit() {
    this.submitData.emit({ book: this.book.id })
  }

  getNumbers(count: number): number[] {
    return Array.from({ length: count }, (v, k) => k + 1);
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['books']) {
      this.book = this.books[0]
      window.scroll({
        top: 0,
        left: 0,
        behavior: 'smooth'
      });
      this.submit()
    }
  }

  onBookChange(book: Book): void {
    this.submit()
    window.scroll({
      top: 0,
      left: 0,
      behavior: 'smooth'
    });
  }

}
