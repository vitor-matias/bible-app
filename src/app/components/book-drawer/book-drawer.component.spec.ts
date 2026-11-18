import { TestBed } from "@angular/core/testing"
import { MAT_DIALOG_DATA, MatDialogRef } from "@angular/material/dialog"
import { By } from "@angular/platform-browser"
import { BehaviorSubject } from "rxjs"
import { BookService } from "../../services/book.service"
import { createSpyObj } from "../../testing/spy-obj"
import { BookSelectorComponent } from "../book-selector/book-selector.component"
import { BookDrawerComponent } from "./book-drawer.component"

describe("BookDrawerComponent", () => {
  const books$ = new BehaviorSubject<Book[]>([])
  const dialogRef = createSpyObj("MatDialogRef", ["close"])

  function open() {
    TestBed.configureTestingModule({
      providers: [
        { provide: BookService, useValue: { books$ } },
        { provide: MatDialogRef, useValue: dialogRef },
        { provide: MAT_DIALOG_DATA, useValue: { selectedBookId: "indice" } },
      ],
    })
    const fixture = TestBed.createComponent(BookDrawerComponent)
    fixture.detectChanges()
    return fixture
  }

  it("lists the books as they load, with the page's book selected", async () => {
    const fixture = open()
    const selector = fixture.debugElement.query(
      By.directive(BookSelectorComponent),
    ).componentInstance as BookSelectorComponent
    expect(selector.books()).toEqual([])
    expect(selector.selectedBookId()).toBe("indice")

    const gn = { id: "gn", abrv: "Gn", name: "Génesis" } as Book
    books$.next([gn])
    await fixture.whenStable()

    expect(selector.books()).toEqual([gn])
  })

  it("closes with the book picked", () => {
    const fixture = open()
    fixture.debugElement
      .query(By.directive(BookSelectorComponent))
      .componentInstance.submitData.emit({ bookId: "gn" })

    expect(dialogRef.close).toHaveBeenCalledWith("gn")
  })
})
