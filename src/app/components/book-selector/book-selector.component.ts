import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';

@Component({
  selector: 'book-selector',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './book-selector.component.html',
  styleUrl: './book-selector.component.css'
})
export class BookSelectorComponent {
  oldTestamentBooks: Book['id'][] = [
    'gen', 'exo', 'lev', 'num', 'deu', 'jos', 'jdg',
    'rut', '1sa', '2sa', '1ki', '2ki', '1ch', '2ch',
    'ezr', 'neh', 'est', 'job', 'psa', 'pro', 'ecc',
    'sng', 'isa', 'jer', 'lam', 'ezk', 'dan', 'hos',
    'jol', 'amo', 'oba', 'jon', 'mic', 'nam', 'hab',
    'zep', 'hag', 'mal', 'zec', 'mal', 'tob', 'jdt', 'wis',
    'sir', 'bar', '1ma', '2ma'
  ];

  newTestamentBooks: string[] = [
    'mat', 'mrk',
    'luk', 'jhn', 'act', 'rom', '1co', '2co', 'gal',
    'eph', 'php', 'col', '1th', '2th', '1ti', '2ti',
    'tit', 'phm', 'heb', 'jas', '1pe', '2pe', '1jn',
    '2jn', '3jn', 'jud', 'rev'
  ];

  @Input()
  books: Book[] = []
}
