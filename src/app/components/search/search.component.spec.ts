import { ChangeDetectorRef } from "@angular/core"
import { MatSnackBar } from "@angular/material/snack-bar"
import { Router } from "@angular/router"
import { of } from "rxjs"
import { BibleApiService } from "../../services/bible-api.service"
import { BibleReferenceService } from "../../services/bible-reference.service"
import { BookService } from "../../services/book.service"
import { SearchComponent } from "./search.component"

describe("SearchComponent", () => {
  let component: SearchComponent
  let apiService: jasmine.SpyObj<BibleApiService>
  let referenceService: jasmine.SpyObj<BibleReferenceService>
  let bookService: jasmine.SpyObj<BookService>
  let snackBar: jasmine.SpyObj<MatSnackBar>
  let router: jasmine.SpyObj<Router>
  let cdr: Pick<ChangeDetectorRef, "detectChanges">

  beforeEach(() => {
    apiService = jasmine.createSpyObj("BibleApiService", ["getVerse", "search"])
    referenceService = jasmine.createSpyObj("BibleReferenceService", [
      "extract",
    ])
    bookService = jasmine.createSpyObj("BookService", ["findBook"])
    snackBar = jasmine.createSpyObj("MatSnackBar", ["open"])
    router = jasmine.createSpyObj("Router", ["navigate"])
    router.navigate.and.resolveTo(true)
    cdr = { detectChanges: jasmine.createSpy("detectChanges") }

    component = new SearchComponent(
      apiService,
      referenceService,
      bookService,
      snackBar,
      router,
      cdr as ChangeDetectorRef,
    )
  })

  it("should create", () => {
    expect(component).toBeTruthy()
  })

  it("should navigate to a direct reference using verseStart", async () => {
    const verse = {
      bookId: "jhn",
      chapterNumber: 3,
      number: 16,
      verseLabel: "16",
      text: [],
    } as Verse

    referenceService.extract.and.returnValue([
      {
        match: "John 3:16",
        index: 0,
        book: "John",
        chapter: 3,
        verses: [{ type: "single", verse: 16 }],
      },
    ])
    bookService.findBook.and.returnValue({
      id: "jhn",
      abrv: "Jo",
      shortName: "Joao",
      name: "Evangelho segundo Joao",
      chapterCount: 21,
    })
    apiService.getVerse.and.returnValue(of(verse))

    await component.onSearchSubmit("John 3:16")

    expect(router.navigate).toHaveBeenCalledWith(["/", "jhn", 3], {
      queryParams: { verseStart: 16 },
    })
  })

  it("should keep loadMoreResults locked until the next page arrives", async () => {
    const nextVerse = {
      bookId: "gen",
      chapterNumber: 1,
      number: 2,
      verseLabel: "2",
      text: [{ type: "text", text: "Second verse" }],
    } as Verse

    component.searchTerm = "beginning"
    component.currentPage = 1
    component.totalResults = 2
    component.searchResults = [
      {
        bookId: "gen",
        chapterNumber: 1,
        number: 1,
        verseLabel: "1",
        text: [{ type: "text", text: "First verse" }],
      } as Verse,
    ]
    apiService.search.and.returnValue(
      of({ verses: [nextVerse], total: 2 } as VersePage),
    )

    await component["loadMoreResults"]()

    expect(apiService.search).toHaveBeenCalledWith("beginning", 2)
    expect(component.searchResults).toEqual([
      jasmine.objectContaining({ number: 1 }),
      nextVerse,
    ])
    expect(component.currentPage).toBe(2)
    expect(component.isLoading).toBeFalse()
  })
})
