import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SimpleChange } from '@angular/core';
import { ChapterSelectorComponent } from './chapter-selector.component';
import { BookmarkService } from '../../services/bookmark.service';
import { of } from 'rxjs';
import { MatListModule } from '@angular/material/list';
import { MatIconModule } from '@angular/material/icon';
import { CommonModule } from '@angular/common';

describe('ChapterSelectorComponent', () => {
    let component: ChapterSelectorComponent;
    let fixture: ComponentFixture<ChapterSelectorComponent>;
    let bookmarkServiceSpy: jasmine.SpyObj<BookmarkService>;

    const mockBookmarks = new Map<number, string>([
        [1, '#F44336']
    ]);

    beforeEach(async () => {
        const spy = jasmine.createSpyObj('BookmarkService', ['getBookmarksForBook']);
        spy.getBookmarksForBook.and.returnValue(of([
            { bookId: 'GEN', chapter: 1, color: '#F44336', timestamp: 123 }
        ]));

        await TestBed.configureTestingModule({
            imports: [ChapterSelectorComponent, CommonModule, MatListModule, MatIconModule],
            providers: [
                { provide: BookmarkService, useValue: spy }
            ]
        }).compileComponents();

        fixture = TestBed.createComponent(ChapterSelectorComponent);
        component = fixture.componentInstance;
        bookmarkServiceSpy = TestBed.inject(BookmarkService) as jasmine.SpyObj<BookmarkService>;

        component.chapters = [
            { bookId: 'GEN', number: 1, title: 'Creation' },
            { bookId: 'GEN', number: 2, title: 'Eden' }
        ];
        component.bookId = 'GEN';

        // Manually trigger ngOnChanges to initialize bookmarks$
        component.ngOnChanges({
            bookId: new SimpleChange(null, 'GEN', true)
        } as any);

        fixture.detectChanges();
    });

    it('should create', () => {
        expect(component).toBeTruthy();
    });

    it('should render bookmark icon for bookmarked chapters', () => {
        const compiled = fixture.nativeElement as HTMLElement;
        const icons = compiled.querySelectorAll('.bookmark-icon');
        expect(icons.length).toBe(1);

        const firstChapterButton = compiled.querySelector('.chapterSelectorButton');
        expect(firstChapterButton?.querySelector('.bookmarked')).toBeTruthy();
        expect(firstChapterButton?.querySelector('.bookmark-icon')).toBeTruthy();
    });

    it('should not render bookmark icon for non-bookmarked chapters', () => {
        const compiled = fixture.nativeElement as HTMLElement;
        const buttons = compiled.querySelectorAll('.chapterSelectorButton');
        const secondChapterButton = buttons[1];
        expect(secondChapterButton.querySelector('.bookmark-icon')).toBeFalsy();
        expect(secondChapterButton.querySelector('.bookmarked')).toBeFalsy();
    });

    it('should apply colored style to bookmark icon', () => {
        const compiled = fixture.nativeElement as HTMLElement;
        const icon = compiled.querySelector('.bookmark-icon') as HTMLElement;
        // Note: Angular might apply styles differently, so we check if the color is what we expect or if it's dynamic
        expect(icon.style.color).toBe('rgb(244, 67, 54)'); // #F44336 in RGB
    });
});
