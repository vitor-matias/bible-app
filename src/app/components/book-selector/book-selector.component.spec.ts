import { type ComponentFixture, TestBed } from "@angular/core/testing"

import { BookSelectorComponent } from "./book-selector.component"

describe("BookSelectorComponent", () => {
	let component: BookSelectorComponent
	let fixture: ComponentFixture<BookSelectorComponent>

	beforeEach(async () => {
		await TestBed.configureTestingModule({
			imports: [BookSelectorComponent],
		}).compileComponents()

		fixture = TestBed.createComponent(BookSelectorComponent)
		component = fixture.componentInstance
		fixture.detectChanges()
	})

	it("should create", () => {
		expect(component).toBeTruthy()
	})
})
