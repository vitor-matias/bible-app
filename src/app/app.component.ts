import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { BibleApiService } from './services/bible-api.service';
import { CommonModule } from '@angular/common';
import { VerseComponent } from "./components/verse/verse.component";
import { HeaderComponent } from './components/header/header.component';

@Component({
  selector: 'app-root',
  standalone: true,
  templateUrl: './app.component.html',
  styleUrl: './app.component.css',
  imports: [RouterOutlet, CommonModule, VerseComponent, HeaderComponent]
})
export class AppComponent {
  title = 'bible-app'

  book!: Book
  books!: Book[];

  constructor(private apiService: BibleApiService) { }

  ngOnInit(): void {
    this.getBooks()
    this.getBook('gen')

  }

  onHeaderSubmit(event: { book: string }) {
    this.getBook(event.book)
  }

  getBook(book: string) {
    this.apiService.getBook(book).subscribe({
      next: res => { this.book = res; },
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
