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
import type { MockedObject } from "vitest"
import { AnalyticsService } from "../../services/analytics.service"
import { BookService } from "../../services/book.service"
import { BookmarkService } from "../../services/bookmark.service"
import { ribbonColor } from "../../services/bookmark-ribbons.service"
import { HapticsService } from "../../services/haptics.service"
import { BookmarkSelectorComponent } from "./bookmark-selector.component"

describe("BookmarkSelectorComponent", () => {
  let component: BookmarkSelectorComponent
  let hapticsSpy: MockedObject<HapticsService>
  let fixture: ComponentFixture<BookmarkSelectorComponent>
  let bookmarkServiceSpy: MockedObject<BookmarkService>
  let _bookServiceSpy: MockedObject<BookService>
  let bottomSheetRefSpy: MockedObject<
    MatBottomSheetRef<BookmarkSelectorComponent>
  >
  let routerSpy: MockedObject<Router>
  let analyticsServiceSpy: MockedObject<AnalyticsService>
  let bookmarksSubject: BehaviorSubject<Bookmark[]>

  const mockData = { bookId: "GEN", chapter: 1 }
  const mockBookmarks: Bookmark[] = [
    { bookId: "MRK", chapter: 2, color: "blue", timestamp: 456 },
  ]

  beforeEach(async () => {
    const bookmarkSpy = {
      addBookmark: vi.fn().mockName("BookmarkService.addBookmark"),
      removeBookmark: vi.fn().mockName("BookmarkService.removeBookmark"),
    }
    const bookSpy = {
      findBookById: vi.fn().mockName("BookService.findBookById"),
      getUrlAbrv: vi.fn().mockName("BookService.getUrlAbrv"),
      getChapterUrlSegment: vi
        .fn()
        .mockName("BookService.getChapterUrlSegment"),
    }
    const sheetSpy = {
      dismiss: vi.fn().mockName("MatBottomSheetRef.dismiss"),
    }
    const rSpy = {
      navigate: vi.fn().mockName("Router.navigate"),
    }
    analyticsServiceSpy = {
      track: vi.fn().mockName("AnalyticsService.track"),
    }
    analyticsServiceSpy.track.mockResolvedValue()

    bookmarksSubject = new BehaviorSubject<Bookmark[]>(mockBookmarks)
    void Object.defineProperty(bookmarkSpy, "bookmarks$", {
      get: () => bookmarksSubject.asObservable(),
    })

    bookmarkSpy.addBookmark.mockResolvedValue()
    hapticsSpy = {
      light: vi.fn().mockName("HapticsService.light"),
      success: vi.fn().mockName("HapticsService.success"),
    }
    bookmarkSpy.removeBookmark.mockResolvedValue()
    bookSpy.findBookById.mockReturnValue({ abrv: "Mc", shortName: "Marcos" })
    bookSpy.getUrlAbrv.mockReturnValue("mrk")
    bookSpy.getChapterUrlSegment.mockImplementation((chapter: number) =>
      chapter === 0 ? "intro" : chapter.toString(),
    )

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
        { provide: HapticsService, useValue: hapticsSpy },
      ],
    }).compileComponents()

    fixture = TestBed.createComponent(BookmarkSelectorComponent)
    component = fixture.componentInstance
    bookmarkServiceSpy = TestBed.inject(
      BookmarkService,
    ) as MockedObject<BookmarkService>
    _bookServiceSpy = TestBed.inject(BookService) as MockedObject<BookService>
    bottomSheetRefSpy = TestBed.inject(MatBottomSheetRef) as MockedObject<
      MatBottomSheetRef<BookmarkSelectorComponent>
    >
    routerSpy = TestBed.inject(Router) as MockedObject<Router>

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

  // Android's WebView painted the sheet garbled while the ribbons were cut to
  // shape with clip-path: half the sheet missing, ghost ribbons beside them.
  // The colour is the theme's tone for the ribbon (--ribbon-*).
  it("draws each ribbon's shape in its colour instead of clipping the button", () => {
    const buttons = Array.from(
      fixture.nativeElement.querySelectorAll(".color-button"),
    ) as HTMLElement[]
    expect(buttons.length).toBe(component.ribbons.length)

    buttons.forEach((button, index) => {
      expect(getComputedStyle(button).clipPath).toBe("none")
      const shape = button.querySelector(".ribbon-shape path") as SVGElement
      expect(getComputedStyle(shape).fill).toBe(
        colorOf(ribbonColor(component.ribbons[index].value) ?? ""),
      )
    })
  })

  // A screen reader said "Red", "Orange"… in an app otherwise in Portuguese.
  it("names each ribbon in Portuguese, with the passage it marks", () => {
    const labels = Array.from(
      fixture.nativeElement.querySelectorAll(".color-button"),
      (button: Element) => button.getAttribute("aria-label"),
    )

    expect(labels).toEqual([
      "Vermelho",
      "Laranja",
      "Azul-petróleo",
      "Verde",
      "Azul, Mc 2",
      "Índigo",
      "Violeta",
      "Cinzento",
    ])
  })

  /** A CSS colour as getComputedStyle reports it ("red" → "rgb(255, 0, 0)"). */
  const colorOf = (color: string): string => {
    const probe = document.createElement("span")
    probe.style.color = color
    document.body.append(probe)
    const computed = getComputedStyle(probe).color
    probe.remove()
    return computed
  }

  it("should toggle delete mode", () => {
    expect(component.isDeleteMode).toBe(false)
    component.toggleDeleteMode()
    expect(component.isDeleteMode).toBe(true)
  })

  it("should navigate when clicking a ribbon assigned elsewhere", () => {
    const blueRibbon = component.ribbons.find((r) => r.value === "blue")
    expect(blueRibbon).toBeTruthy()
    if (blueRibbon) {
      component.handleRibbonClick(blueRibbon)
    }

    expect(routerSpy.navigate).toHaveBeenCalledWith(["mrk", "2"])
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
    expect(hapticsSpy.success).toHaveBeenCalled()
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

  describe("moving a ribbon read on from", () => {
    const moveButton = (): HTMLButtonElement | null =>
      fixture.nativeElement.querySelector(".move-button")
    const blueOnIntro: Bookmark = {
      bookId: "GEN",
      chapter: 0,
      color: "blue",
      timestamp: 1,
    }

    it("offers nothing without a ribbon behind this chapter", () => {
      expect(moveButton()).toBeNull()
    })

    it("moves the ribbon here, then undoes the move", () => {
      bookmarksSubject.next([blueOnIntro])
      fixture.detectChanges()
      expect(moveButton()?.textContent).toContain(
        "Mover o marcador azul de Mc Introdução para Mc 1",
      )

      moveButton()?.click()
      expect(bookmarkServiceSpy.addBookmark).toHaveBeenCalledWith(
        "GEN",
        1,
        "blue",
      )
      bookmarksSubject.next([{ ...blueOnIntro, chapter: 1, timestamp: 2 }])
      fixture.detectChanges()
      expect(moveButton()?.textContent).toContain(
        "Desfazer: o marcador azul volta a Mc Introdução",
      )

      moveButton()?.click()
      expect(bookmarkServiceSpy.addBookmark).toHaveBeenCalledWith(
        "GEN",
        0,
        "blue",
      )
      bookmarksSubject.next([blueOnIntro])
      fixture.detectChanges()
      expect(moveButton()?.textContent).toContain("Mover o marcador azul")
    })
  })

  it("should warn and not navigate when bookmark references unknown book", () => {
    const bookServiceSpy = TestBed.inject(
      BookService,
    ) as MockedObject<BookService>
    bookServiceSpy.findBookById.mockReturnValue(undefined)
    bookmarksSubject.next([
      { bookId: "UNKNOWN", chapter: 1, color: "blue", timestamp: 789 },
    ])
    fixture.detectChanges()

    vi.spyOn(console, "warn").mockReturnValue(undefined)
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
