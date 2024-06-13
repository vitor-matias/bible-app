import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { BibleApiService } from './services/bible-api.service';
import { CommonModule } from '@angular/common';
import { VerseComponent } from "./components/verse/verse.component";
import { HeaderComponent } from './component/header/header.component';

@Component({
  selector: 'app-root',
  standalone: true,
  templateUrl: './app.component.html',
  styleUrl: './app.component.css',
  imports: [RouterOutlet, CommonModule, VerseComponent, HeaderComponent]
})
export class AppComponent {
  title = 'bible-app'

  chapter!: Chapter
  books!: Book[];

  constructor(private apiService: BibleApiService) { }

  ngOnInit(): void {
    this.getChapter('gen', 1)
    this.getBooks()
  }

  onHeaderSubmit(event: {book: string, chapter: number}) {
    this.getChapter(event.book, event.chapter)
  }

  getChapter(book: string, chapterNumber: number) {
    this.apiService.getChapter(book, chapterNumber).subscribe({
      next: res => { this.chapter = res; },
      error: err => console.error(err)
    });
  }

  getBooks() {
    this.apiService.getAvailableBooks().subscribe({
      next: res => { this.books = res; },
      error: err => console.error(err)
    });
  }
}
