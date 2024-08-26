import { CommonModule } from "@angular/common"
// biome-ignore lint/style/useImportType: <explanation>
import {
	ChangeDetectionStrategy,
	ChangeDetectorRef,
	Component,
	ViewChild,
	afterRender,
	inject,
} from "@angular/core"
import {
	MatBottomSheet,
	MatBottomSheetModule,
	MatBottomSheetRef,
} from "@angular/material/bottom-sheet"
import {
	type MatDrawer,
	type MatDrawerContainer,
	MatSidenavModule,
} from "@angular/material/sidenav"
import { RouterOutlet } from "@angular/router"
import { NgbPaginationModule } from "@ng-bootstrap/ng-bootstrap"
import { BookSelectorComponent } from "./components/book-selector/book-selector.component"
import { HeaderComponent } from "./components/header/header.component"
import { ChapterPagination } from "./components/pagination/chapter-pagination"
import { VerseComponent } from "./components/verse/verse.component"
// biome-ignore lint/style/useImportType: <explanation>
import { BibleApiService } from "./services/bible-api.service"

@Component({
	selector: "app-root",
	standalone: true,
	templateUrl: "./app.component.html",
	styleUrl: "./app.component.css",
	imports: [
		RouterOutlet,
		CommonModule,
		VerseComponent,
		HeaderComponent,
		BookSelectorComponent,
		MatSidenavModule,
		NgbPaginationModule,
		MatBottomSheetModule,
		ChapterPagination,
	],
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppComponent {
	title = "bible-app"

	@ViewChild("drawer")
	drawer!: MatDrawer

	@ViewChild("container")
	container!: MatDrawerContainer

	//private _bottomSheet = inject(MatBottomSheet)

	book!: Book
	books!: Book[]
	chapterNumber = 1
	chapter!: Chapter

	constructor(
		private apiService: BibleApiService,
		private cdr: ChangeDetectorRef,
	) {}

	ngOnInit(): void {
		this.getBooks()
		this.getChapter("gen", 1)

		//setTimeout(() => this.openBottomSheet(), 7000)
	}

	openBottomSheet(): void {
		//this._bottomSheet.open(ChapterPagination)
	}

	onBookSubmit(event: { bookId: string }) {
		this.chapterNumber = 1
		this.book =
			this.books.find((book) => book.id === event.bookId) || ({} as Book)

		this.getChapter(event.bookId, this.chapterNumber)

		this.drawer.close()
	}

	getBook(book: string) {
		this.apiService.getBook(book).subscribe({
			next: (res) => {
				this.book = res
			},
			error: (err) => console.error(err),
		})
	}

	getBooks() {
		this.apiService.getAvailableBooks().subscribe({
			next: (res) => {
				this.books = res
				this.book = this.books.find((book) => book.id === "gen") || ({} as Book)
			},
			error: (err) => console.error(err),
		})
	}

	getChapter(book: Book["id"], chapter: Chapter["number"]) {
		this.chapterNumber = chapter
		this.apiService.getChapter(book, chapter).subscribe({
			next: (res) => {
				this.chapter = res
				this.cdr.detectChanges()
				this.scrollToTop()
			},
			error: (err) => console.error(err),
		})
	}

	scrollToTop() {
		setTimeout(() => {
			this.container._content.scrollTo({ top: 0, behavior: "smooth" })
		}, 0)
	}

	openDrawer(event: { open: boolean }) {
		this.drawer.open()
	}
}
