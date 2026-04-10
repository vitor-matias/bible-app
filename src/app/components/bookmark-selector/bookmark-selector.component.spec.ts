import { CommonModule } from "@angular/common"
import { ComponentFixture, TestBed } from "@angular/core/testing"
import {
  MAT_BOTTOM_SHEET_DATA,
  MatBottomSheetRef,
} from "@angular/material/bottom-sheet"
import { MatButtonModule } from "@angular/material/button"
import { MatIconModule } from "@angular/material/icon"
import { Router } from "@angular/router"
import { BehaviorSubject } from "rxjs"
import { BookService } from "../../services/book.service"
import { BookmarkService } from "../../services/bookmark.service"
import { BookmarkSelectorComponent } from "./bookmark-selector.component"
import { AnalyticsService } from "../../services/analytics.service"

describe("BookmarkSelectorComponent", () => {
  let component: BookmarkSelectorComponent
  let fixture: ComponentFixture<BookmarkSelectorComponent>
  let bookmarkServiceSpy: jasmine.SpyObj<BookmarkService>
  let _bookServiceSpy: jasmine.SpyObj<BookService>
  let bottomSheetRefSpy: jasmine.SpyObj<
    MatBottomSheetRef<BookmarkSelectorComponent>
  >
  let routerSpy: jasmine.SpyObj<Router>
  let analyticsServiceSpy: jasmine.SpyObj<AnalyticsService>
  let bookmarksSubject: BehaviorSubject<Bookmark[]>

  const mockData = { bookId: "GEN", chapter: 1 }
  const mockBookmarks: Bookmark[] = [
    { bookId: "MRK", chapter: 2, color: "blue", timestamp: 456 },
  ]

  beforeEach(async () => {
    const bookmarkSpy = jasmine.createSpyObj("BookmarkService", [
      "addBookmark",
      "removeBookmark",
    ])
    const bookSpy = jasmine.createSpyObj("BookService", [
      "findBookById",
      "getUrlAbrv",
    ])
    const sheetSpy = jasmine.createSpyObj("MatBottomSheetRef", ["dismiss"])
    const rSpy = jasmine.createSpyObj("Router", ["navigate"])
    analyticsServiceSpy = jasmine.createSpyObj("AnalyticsService", ["track"])

    bookmarksSubject = new BehaviorSubject<Bookmark[]>(mockBookmarks)
    void Object.defineProperty(bookmarkSpy, "bookmarks$", {
      get: () => bookmarksSubject.asObservable(),
    })

    bookmarkSpy.addBookmark.and.returnValue(Promise.resolve())
    bookmarkSpy.removeBookmark.and.returnValue(Promise.resolve())
    bookSpy.findBookById.and.returnValue({ abrv: "Mc", shortName: "Marcos" })
    bookSpy.getUrlAbrv.and.returnValue("mrk")

    await TestBed.configureTestingModule({
      imports: [
        BookmarkSelectorComponent,
        CommonModule,
        MatButtonModule,
        MatIconModule,
      ],
      providers: [
        { provide: MAT_BOTTOM_SHEET_DATA, useValue: mockData },
        { provide: BookmarkService, useValue: bookmarkSpy },
        { provide: BookService, useValue: bookSpy },
        { provide: MatBottomSheetRef, useValue: sheetSpy },
        { provide: Router, useValue: rSpy },
        { provide: AnalyticsService, useValue: analyticsServiceSpy },
      ],
    }).compileComponents()

    fixture = TestBed.createComponent(BookmarkSelectorComponent)
    component = fixture.componentInstance
    bookmarkServiceSpy = TestBed.inject(
      BookmarkService,
    ) as jasmine.SpyObj<BookmarkService>
    _bookServiceSpy = TestBed.inject(BookService) as jasmine.SpyObj<BookService>
    bottomSheetRefSpy = TestBed.inject(MatBottomSheetRef) as jasmine.SpyObj<
      MatBottomSheetRef<BookmarkSelectorComponent>
    >
    routerSpy = TestBed.inject(Router) as jasmine.SpyObj<Router>

    fixture.detectChanges()
  })

  it("should create", () => {
    expect(component).toBeTruthy()
  })

  it("should initialize ribbons based on current bookmarks", () => {
    expect(component.ribbons.length).toBe(component.colors.length)
    const blueRibbon = component.ribbons.find((r) => r.value === "blue")
    expect(blueRibbon?.currentRef).toBe("Mc 2")
    expect(blueRibbon?.bookmark).toBeTruthy()

    const redRibbon = component.ribbons.find((r) => r.value === "red")
    expect(redRibbon?.currentRef).toBeUndefined()
    expect(redRibbon?.bookmark).toBeUndefined()
  })

  it("should toggle delete mode", () => {
    expect(component.isDeleteMode).toBeFalse()
    component.toggleDeleteMode()
    expect(component.isDeleteMode).toBeTrue()
  })

  it("should navigate when clicking a ribbon assigned elsewhere", () => {
    const blueRibbon = component.ribbons.find((r) => r.value === "blue")
    expect(blueRibbon).toBeTruthy()
    if (blueRibbon) {
      component.handleRibbonClick(blueRibbon)
    }

    expect(routerSpy.navigate).toHaveBeenCalledWith(["mrk", 2])
    expect(bottomSheetRefSpy.dismiss).toHaveBeenCalled()
  })

  it("should add bookmark when clicking an empty ribbon", () => {
    const redRibbon = component.ribbons.find((r) => r.value === "red")
    expect(redRibbon).toBeTruthy()
    if (redRibbon) {
      component.handleRibbonClick(redRibbon)
    }

    expect(bookmarkServiceSpy.addBookmark).toHaveBeenCalledWith("GEN", 1, "red")
    expect(bottomSheetRefSpy.dismiss).not.toHaveBeenCalled()
  })

  it("should NOT remove bookmark when clicking ribbon assigned to current location", () => {
    // Modify mock for this test
    bookmarksSubject.next([
      { bookId: "GEN", chapter: 1, color: "red", timestamp: 123 },
    ])
    fixture.detectChanges()

    const redRibbon = component.ribbons.find((r) => r.value === "red")
    expect(redRibbon).toBeTruthy()
    if (redRibbon) {
      component.handleRibbonClick(redRibbon)
    }

    expect(bookmarkServiceSpy.removeBookmark).not.toHaveBeenCalled()
    expect(bottomSheetRefSpy.dismiss).toHaveBeenCalled()
  })

  it("should delete bookmark when in delete mode", () => {
    component.toggleDeleteMode()
    const blueRibbon = component.ribbons.find((r) => r.value === "blue")
    expect(blueRibbon).toBeTruthy()
    if (blueRibbon) {
      component.handleRibbonClick(blueRibbon)
    }

    expect(bookmarkServiceSpy.removeBookmark).toHaveBeenCalledWith("MRK", 2)
  })

  it("should warn and not navigate when bookmark references unknown book", () => {
    const bookServiceSpy = TestBed.inject(
      BookService,
    ) as jasmine.SpyObj<BookService>
    bookServiceSpy.findBookById.and.returnValue(undefined)
    bookmarksSubject.next([
      { bookId: "UNKNOWN", chapter: 1, color: "blue", timestamp: 789 },
    ])
    fixture.detectChanges()

    spyOn(console, "warn")
    const blueRibbon = component.ribbons.find((r) => r.value === "blue")
    expect(blueRibbon).toBeTruthy()
    if (blueRibbon) {
      component.handleRibbonClick(blueRibbon)
    }

    expect(routerSpy.navigate).not.toHaveBeenCalled()
    expect(bottomSheetRefSpy.dismiss).not.toHaveBeenCalled()
    expect(console.warn).toHaveBeenCalledWith(
      "Bookmark references unknown book: UNKNOWN",
    )
  })
})
