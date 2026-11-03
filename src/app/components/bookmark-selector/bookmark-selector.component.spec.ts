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
import { AnalyticsService } from "../../services/analytics.service"
import { BookService } from "../../services/book.service"
import { BookmarkService } from "../../services/bookmark.service"
import {
  type RibbonState,
  ribbonColor,
} from "../../services/bookmark-ribbons.service"
import { HapticsService } from "../../services/haptics.service"
import { createSpyObj, type SpyObj } from "../../testing/spy-obj"
import { BookmarkSelectorComponent } from "./bookmark-selector.component"

describe("BookmarkSelectorComponent", () => {
  let component: BookmarkSelectorComponent
  let hapticsSpy: SpyObj<HapticsService>
  let fixture: ComponentFixture<BookmarkSelectorComponent>
  let bookmarkServiceSpy: SpyObj<BookmarkService>
  let _bookServiceSpy: SpyObj<BookService>
  let bottomSheetRefSpy: SpyObj<MatBottomSheetRef<BookmarkSelectorComponent>>
  let routerSpy: SpyObj<Router>
  let analyticsServiceSpy: SpyObj<AnalyticsService>
  let bookmarksSubject: BehaviorSubject<Bookmark[]>

  const mockData = { bookId: "GEN", chapter: 1 }
  const mockBookmarks: Bookmark[] = [
    { bookId: "MRK", chapter: 2, color: "blue", timestamp: 456 },
  ]

  beforeEach(async () => {
    const bookmarkSpy = createSpyObj("BookmarkService", [
      "addBookmark",
      "removeBookmark",
    ])
    const bookSpy = createSpyObj("BookService", [
      "findBookById",
      "getUrlAbrv",
      "getChapterUrlSegment",
    ])
    const sheetSpy = createSpyObj("MatBottomSheetRef", ["dismiss"])
    const rSpy = createSpyObj("Router", ["navigate"])
    analyticsServiceSpy = createSpyObj("AnalyticsService", ["track"])
    analyticsServiceSpy.track.mockResolvedValue(undefined)

    bookmarksSubject = new BehaviorSubject<Bookmark[]>(mockBookmarks)
    void Object.defineProperty(bookmarkSpy, "bookmarks$", {
      get: () => bookmarksSubject.asObservable(),
    })

    bookmarkSpy.addBookmark.mockResolvedValue(undefined)
    hapticsSpy = createSpyObj("HapticsService", ["light", "success"])
    bookmarkSpy.removeBookmark.mockResolvedValue(undefined)
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
    ) as SpyObj<BookmarkService>
    _bookServiceSpy = TestBed.inject(BookService) as SpyObj<BookService>
    bottomSheetRefSpy = TestBed.inject(MatBottomSheetRef) as SpyObj<
      MatBottomSheetRef<BookmarkSelectorComponent>
    >
    routerSpy = TestBed.inject(Router) as SpyObj<Router>

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

  // Android's WebView painted the old ribbon-shaped buttons garbled while they
  // were cut to shape with clip-path; the glyphs are drawn, never clipped.
  // The colour is the theme's tone for the ribbon (--ribbon-*).
  it("draws each tile's glyph in its ribbon's tone, unclipped", () => {
    const tiles = Array.from(
      fixture.nativeElement.querySelectorAll(".tile"),
    ) as HTMLElement[]
    expect(tiles.length).toBe(component.ribbons.length)

    tiles.forEach((tile, index) => {
      expect(getComputedStyle(tile).clipPath).toBe("none")
      const glyph = tile.querySelector(".glyph") as SVGElement
      expect(getComputedStyle(glyph).fill).toBe(
        colorOf(ribbonColor(component.ribbons[index].value) ?? ""),
      )
    })
  })

  it("shows a free ribbon by its colour's name and a used one by its passage", () => {
    const label = (index: number): string | undefined =>
      fixture.nativeElement
        .querySelectorAll(".tile")
        [index].querySelector(".tile-label")
        ?.textContent?.trim()

    expect(label(0)).toBe("Vermelho")
    expect(label(4)).toBe("Mc 2")
  })

  // A screen reader said "Red", "Orange"… in an app otherwise in Portuguese.
  it("names each ribbon in Portuguese, with the passage it marks or that it is free", () => {
    const labels = Array.from(
      fixture.nativeElement.querySelectorAll(".tile"),
      (tile: Element) => tile.getAttribute("aria-label"),
    )

    expect(labels).toEqual([
      "Vermelho, livre",
      "Laranja, livre",
      "Azul-petróleo, livre",
      "Verde, livre",
      "Azul, Mc 2",
      "Índigo, livre",
      "Violeta, livre",
      "Cinzento, livre",
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

  describe("editing", () => {
    const pill = (): HTMLButtonElement | null =>
      fixture.nativeElement.querySelector(".pill")
    const tiles = (): HTMLButtonElement[] =>
      Array.from(fixture.nativeElement.querySelectorAll(".tile"))

    it("is offered only while a ribbon is on", () => {
      expect(pill()?.textContent?.trim()).toBe("Editar")

      bookmarksSubject.next([])
      fixture.detectChanges()

      expect(pill()).toBeNull()
    })

    it("shows a badge on each used ribbon and lets the free ones step back", () => {
      pill()?.click()
      fixture.detectChanges()

      expect(pill()?.textContent?.trim()).toBe("Concluído")
      expect(pill()?.getAttribute("aria-pressed")).toBe("true")
      expect(
        fixture.nativeElement.querySelectorAll(".remove-badge").length,
      ).toBe(1)
      expect(tiles().filter((tile) => tile.disabled).length).toBe(7)
      expect(tiles()[4].disabled).toBe(false)
      expect(
        fixture.nativeElement.querySelector(".hint").textContent,
      ).toContain("Toque numa fita para a retirar.")
    })

    it("takes the ribbon off when its tile is tapped, and ends when none is left", () => {
      pill()?.click()
      fixture.detectChanges()

      tiles()[4].click()
      expect(bookmarkServiceSpy.removeBookmark).toHaveBeenCalledWith("MRK", 2)

      bookmarksSubject.next([])
      fixture.detectChanges()
      expect(component.isDeleteMode).toBe(false)
      expect(tiles().filter((tile) => tile.disabled).length).toBe(0)
    })
  })

  it("closes from its own button", () => {
    const close = fixture.nativeElement.querySelector(
      ".close-button",
    ) as HTMLButtonElement

    close.click()

    expect(bottomSheetRefSpy.dismiss).toHaveBeenCalled()
  })

  describe("the chapter being read", () => {
    beforeEach(() => {
      bookmarksSubject.next([
        { bookId: "GEN", chapter: 1, color: "red", timestamp: 123 },
      ])
      fixture.detectChanges()
    })

    it("has its ribbon's tile marked, by name as well as by fill", () => {
      const current = fixture.nativeElement.querySelectorAll(".tile.current")

      expect(current.length).toBe(1)
      expect(current[0].getAttribute("aria-label")).toBe(
        "Vermelho, Mc 1, este capítulo",
      )
    })

    it("says so under the ribbons", () => {
      expect(
        fixture.nativeElement.querySelector(".hint").textContent,
      ).toContain(
        "Marcos 1 está marcado. Toque noutra fita livre para mudar a cor.",
      )
    })
  })

  // The About page has no chapters; a ribbon there would lead nowhere to read.
  describe("on the About page", () => {
    beforeEach(() => {
      component.data = { bookId: "about", chapter: 1 }
      bookmarksSubject.next(mockBookmarks)
      fixture.detectChanges()
    })

    it("leaves the free ribbons unmarkable, and says why", () => {
      const tiles: HTMLButtonElement[] = Array.from(
        fixture.nativeElement.querySelectorAll(".tile"),
      )
      expect(tiles.filter((tile) => tile.disabled).length).toBe(7)
      expect(
        fixture.nativeElement.querySelector(".hint").textContent,
      ).toContain("Esta página não se pode marcar.")

      component.handleRibbonClick(
        component.ribbons.find((r) => r.value === "red") as RibbonState,
      )
      expect(bookmarkServiceSpy.addBookmark).not.toHaveBeenCalled()
    })

    it("still opens a ribbon's passage", () => {
      const tiles: HTMLButtonElement[] = Array.from(
        fixture.nativeElement.querySelectorAll(".tile"),
      )
      tiles[4].click()

      expect(routerSpy.navigate).toHaveBeenCalledWith(["mrk", "2"])
    })
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
      fixture.nativeElement.querySelector(".move-row")
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
      expect(moveButton()?.textContent).toContain("Mover para Marcos 1")
      expect(moveButton()?.textContent).toContain(
        "O marcador azul está em Marcos Introdução.",
      )

      moveButton()?.click()
      expect(bookmarkServiceSpy.addBookmark).toHaveBeenCalledWith(
        "GEN",
        1,
        "blue",
      )
      bookmarksSubject.next([{ ...blueOnIntro, chapter: 1, timestamp: 2 }])
      fixture.detectChanges()
      expect(moveButton()?.textContent).toContain("Desfazer")
      expect(moveButton()?.textContent).toContain(
        "O marcador azul volta a Marcos Introdução.",
      )

      moveButton()?.click()
      expect(bookmarkServiceSpy.addBookmark).toHaveBeenCalledWith(
        "GEN",
        0,
        "blue",
      )
      bookmarksSubject.next([blueOnIntro])
      fixture.detectChanges()
      expect(moveButton()?.textContent).toContain("Mover para Marcos 1")
    })
  })

  it("should warn and not navigate when bookmark references unknown book", () => {
    const bookServiceSpy = TestBed.inject(BookService) as SpyObj<BookService>
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
