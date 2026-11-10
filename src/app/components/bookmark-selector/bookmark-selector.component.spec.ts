import { CommonModule } from "@angular/common"
import { ComponentFixture, TestBed } from "@angular/core/testing"
import {
  MAT_BOTTOM_SHEET_DATA,
  MatBottomSheetRef,
} from "@angular/material/bottom-sheet"
import { MatButtonModule } from "@angular/material/button"
import { MatIconModule } from "@angular/material/icon"
import { MatMenuModule } from "@angular/material/menu"
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
        MatMenuModule,
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

  describe("removing a ribbon", () => {
    const button = (label: string): HTMLButtonElement =>
      fixture.nativeElement.querySelector(`.tile[aria-label^="${label}"]`)
    const removeItem = (): HTMLElement | null =>
      document.querySelector(".mat-mdc-menu-panel [mat-menu-item]")
    const undoButton = (): HTMLButtonElement | null =>
      fixture.nativeElement.querySelector(".remove-undo")
    const rightClick = (el: HTMLElement) =>
      el.dispatchEvent(
        new MouseEvent("contextmenu", {
          bubbles: true,
          cancelable: true,
          button: 2,
          clientX: 20,
          clientY: 20,
        }),
      )
    const touch = (el: HTMLElement, type: string, x = 20) =>
      el.dispatchEvent(
        new PointerEvent(type, {
          bubbles: true,
          pointerType: "touch",
          clientX: x,
          clientY: 20,
        }),
      )
    const settle = async () => {
      fixture.detectChanges()
      await fixture.whenStable()
    }

    it("has no delete-mode toggle", () => {
      expect(fixture.nativeElement.querySelector("[aria-pressed]")).toBeNull()
      expect(
        fixture.nativeElement.querySelector(
          '[aria-label="Alternar modo de eliminação"]',
        ),
      ).toBeNull()
    })

    it("opens the passage on a tap and never removes", () => {
      button("Azul,").click()
      expect(routerSpy.navigate).toHaveBeenCalledWith(["mrk", "2"])
      expect(bookmarkServiceSpy.removeBookmark).not.toHaveBeenCalled()
    })

    it("opens the menu on right-click, above the sheet, and removes on choosing", async () => {
      rightClick(button("Azul,"))
      await settle()
      const item = removeItem()
      expect(item?.textContent).toContain("Remover marcador")
      expect(item?.querySelector("mat-icon")?.textContent).toBe("delete")
      // The menu is the topmost thing at its own position.
      const box = (
        document.querySelector(".mat-mdc-menu-panel") as HTMLElement
      ).getBoundingClientRect()
      expect(
        document
          .elementFromPoint(box.left + 5, box.top + 5)
          ?.closest(".mat-mdc-menu-panel"),
      ).not.toBeNull()
      expect(bookmarkServiceSpy.removeBookmark).not.toHaveBeenCalled()

      item?.click()
      expect(bookmarkServiceSpy.removeBookmark).toHaveBeenCalledWith("MRK", 2)
    })

    it("offers free ribbons no menu", async () => {
      rightClick(button("Vermelho"))
      await settle()
      expect(removeItem()).toBeNull()
    })

    it("opens the menu on a long press without navigating", async () => {
      vi.useFakeTimers()
      const blue = button("Azul,")
      touch(blue, "pointerdown")
      await vi.advanceTimersByTimeAsync(499)
      expect(removeItem()).toBeNull()
      await vi.advanceTimersByTimeAsync(2)
      touch(blue, "pointerup")
      await settle()
      // Lifting the finger clicks whatever is under it by now: the menu,
      // which a click closes. Seen in Chrome with real touch input.
      const panel = document.querySelector(".mat-mdc-menu-content")
      panel?.dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true, detail: 1 }),
      )
      await settle()

      expect(removeItem()).not.toBeNull()
      expect(routerSpy.navigate).not.toHaveBeenCalled()
      expect(bottomSheetRefSpy.dismiss).not.toHaveBeenCalled()

      // The next touch is a new gesture: its click removes the ribbon.
      const item = removeItem() as HTMLElement
      touch(item, "pointerdown")
      item.click()
      await settle()
      expect(bookmarkServiceSpy.removeBookmark).toHaveBeenCalled()
    })

    it("arms no long press for a held mouse button or on a free ribbon", async () => {
      vi.useFakeTimers()
      const opened = vi.fn()
      const swallowed = vi.fn()

      // The mouse has a right-click of its own.
      const blue = button("Azul,")
      blue.addEventListener("contextmenu", opened)
      blue.dispatchEvent(
        new PointerEvent("pointerdown", {
          bubbles: true,
          pointerType: "mouse",
        }),
      )
      await vi.advanceTimersByTimeAsync(600)

      // A free ribbon has nothing to remove; its press must not eat a click.
      const red = button("Vermelho")
      red.addEventListener("contextmenu", opened)
      touch(red, "pointerdown")
      await vi.advanceTimersByTimeAsync(600)

      expect(opened).not.toHaveBeenCalled()
      expect(removeItem()).toBeNull()
      document.body.addEventListener("click", swallowed, { once: true })
      document.body.click()
      expect(swallowed).toHaveBeenCalled()
    })

    it("drops a press still held when the sheet is destroyed", async () => {
      vi.useFakeTimers()
      const blue = button("Azul,")
      const opened = vi.fn()
      blue.addEventListener("contextmenu", opened)
      touch(blue, "pointerdown")
      fixture.destroy()
      await vi.advanceTimersByTimeAsync(600)

      expect(opened).not.toHaveBeenCalled()
      // Nor is the page's next click swallowed.
      const clicked = vi.fn()
      document.body.addEventListener("click", clicked, { once: true })
      document.body.click()
      expect(clicked).toHaveBeenCalled()
    })

    it("treats a short or moving touch as a tap, not a long press", async () => {
      vi.useFakeTimers()
      const blue = button("Azul,")
      touch(blue, "pointerdown")
      await vi.advanceTimersByTimeAsync(200)
      touch(blue, "pointerup")
      await vi.advanceTimersByTimeAsync(600)
      expect(removeItem()).toBeNull()

      touch(blue, "pointerdown")
      touch(blue, "pointermove", 60)
      await vi.advanceTimersByTimeAsync(600)
      expect(removeItem()).toBeNull()
    })

    it("tells screen readers the action exists, on marked ribbons only", () => {
      const hintId = button("Azul,").getAttribute("aria-describedby")
      expect(hintId).toBeTruthy()
      expect(
        fixture.nativeElement.querySelector(`#${hintId}`).textContent,
      ).toContain("Shift+F10")
      expect(button("Vermelho").hasAttribute("aria-describedby")).toBe(false)
    })

    it("offers an undo that puts the ribbon back where it was", async () => {
      rightClick(button("Azul,"))
      await settle()
      removeItem()?.click()
      bookmarksSubject.next([])
      fixture.detectChanges()
      expect(undoButton()?.textContent).toContain("Desfazer")
      expect(undoButton()?.textContent).toContain(
        "O marcador azul volta a Marcos 2.",
      )

      bookmarkServiceSpy.addBookmark.mockClear()
      undoButton()?.click()
      expect(bookmarkServiceSpy.addBookmark).toHaveBeenCalledWith(
        "MRK",
        2,
        "blue",
      )
      bookmarksSubject.next(mockBookmarks)
      fixture.detectChanges()
      expect(undoButton()).toBeNull()
    })

    it("drops the undo when the ribbon is marked again some other way", async () => {
      rightClick(button("Azul,"))
      await settle()
      removeItem()?.click()
      bookmarksSubject.next([])
      fixture.detectChanges()
      expect(undoButton()).not.toBeNull()

      bookmarksSubject.next([
        { bookId: "GEN", chapter: 1, color: "blue", timestamp: 9 },
      ])
      fixture.detectChanges()
      expect(undoButton()).toBeNull()
    })

    it("drops the undo when another ribbon takes the removed one's chapter", async () => {
      rightClick(button("Azul,"))
      await settle()
      removeItem()?.click()
      bookmarksSubject.next([])
      fixture.detectChanges()
      expect(undoButton()).not.toBeNull()

      // A chapter holds one ribbon: putting blue back would delete red.
      bookmarksSubject.next([
        { bookId: "MRK", chapter: 2, color: "red", timestamp: 9 },
      ])
      fixture.detectChanges()
      expect(undoButton()).toBeNull()
    })
  })

  describe("the long-press hint", () => {
    const hint = (): HTMLElement | null =>
      fixture.nativeElement.querySelector(".ribbon-hint")

    it("shows while a ribbon marks a passage", () => {
      expect(hint()?.textContent).toContain(
        "Mantenha premido um marcador para o remover.",
      )
    })

    it("is absent when no ribbon marks one", () => {
      bookmarksSubject.next([])
      fixture.detectChanges()
      expect(hint()).toBeNull()
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
