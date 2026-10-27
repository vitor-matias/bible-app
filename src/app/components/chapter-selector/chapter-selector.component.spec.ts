import { CommonModule } from "@angular/common"
import { Component, SimpleChange, ViewChild } from "@angular/core"
import {
  ComponentFixture,
  fakeAsync,
  flush,
  TestBed,
} from "@angular/core/testing"
import { MATERIAL_ANIMATIONS } from "@angular/material/core"
import { MatIconModule } from "@angular/material/icon"
import { MatListModule } from "@angular/material/list"
import { MatDrawer, MatSidenavModule } from "@angular/material/sidenav"
import { of } from "rxjs"
import { BookmarkService } from "../../services/bookmark.service"
import { ChapterSelectorComponent } from "./chapter-selector.component"

describe("ChapterSelectorComponent", () => {
  let component: ChapterSelectorComponent
  let fixture: ComponentFixture<ChapterSelectorComponent>
  let _bookmarkServiceSpy: jasmine.SpyObj<BookmarkService>

  beforeEach(async () => {
    const spy = jasmine.createSpyObj("BookmarkService", ["getBookmarksForBook"])
    spy.getBookmarksForBook.and.returnValue(
      of([{ bookId: "GEN", chapter: 1, color: "red", timestamp: 123 }]),
    )

    await TestBed.configureTestingModule({
      imports: [
        ChapterSelectorComponent,
        CommonModule,
        MatListModule,
        MatIconModule,
      ],
      providers: [{ provide: BookmarkService, useValue: spy }],
    }).compileComponents()

    fixture = TestBed.createComponent(ChapterSelectorComponent)
    component = fixture.componentInstance
    _bookmarkServiceSpy = TestBed.inject(
      BookmarkService,
    ) as jasmine.SpyObj<BookmarkService>

    component.chapters = [
      { bookId: "GEN", number: 1, title: "Creation" },
      { bookId: "GEN", number: 2, title: "Eden" },
    ]
    component.bookId = "GEN"

    // Manually trigger ngOnChanges to initialize bookmarks$
    component.ngOnChanges({
      bookId: new SimpleChange(null, "GEN", true),
    })

    fixture.detectChanges()
  })

  it("should create", () => {
    expect(component).toBeTruthy()
  })

  // ngAfterViewInit also runs while prerendering, where the server DOM has no
  // scrollIntoView — calling it there threw once per prerendered route.
  it("should not scroll straight from ngAfterViewInit", () => {
    component.selectedChapter = 1
    fixture.detectChanges()
    expect(
      (fixture.nativeElement as HTMLElement).querySelector(".highlight"),
    ).toBeTruthy()
    const scrollSpy = spyOn(Element.prototype, "scrollIntoView")

    component.ngAfterViewInit()

    expect(scrollSpy).not.toHaveBeenCalled()
  })

  it("should omit the number slot for the introduction row", () => {
    // setInput (not a plain assignment): the component is OnPush, so a direct
    // property write would not mark it dirty and the old rows would render.
    fixture.componentRef.setInput("chapters", [
      { bookId: "GEN", number: 0, title: "Introdução" },
      { bookId: "GEN", number: 1, title: "Creation" },
    ])
    fixture.detectChanges()

    const rows = fixture.nativeElement.querySelectorAll(
      ".chapterSelectorButton",
    )
    // The intro has no number, so the fixed-width slot must not pad its label.
    expect(rows[0].querySelector(".number-wrapper")).toBeNull()
    expect(rows[0].textContent.trim()).toBe("Introdução")
    // Numbered chapters keep the slot so their numbers stay in one column.
    expect(rows[1].querySelector(".number-wrapper")).toBeTruthy()
  })

  // The other half of the deferral: skipping the scroll on the server must not
  // mean skipping it in the browser. Without this the spec above would pass for
  // an implementation that never scrolls at all.
  it("should still scroll to the selected chapter once a render happens", async () => {
    // A fixture of its own: the shared one has already rendered, and
    // afterNextRender only fires for the render that follows registration.
    const freshFixture = TestBed.createComponent(ChapterSelectorComponent)
    freshFixture.componentInstance.chapters = [
      { bookId: "GEN", number: 1, title: "Creation" },
    ]
    freshFixture.componentInstance.bookId = "GEN"
    freshFixture.componentInstance.selectedChapter = 1
    freshFixture.componentInstance.ngOnChanges({
      bookId: new SimpleChange(null, "GEN", true),
    })
    const scrollSpy = spyOn(Element.prototype, "scrollIntoView")

    freshFixture.detectChanges()
    await freshFixture.whenStable()

    expect(
      (freshFixture.nativeElement as HTMLElement).querySelector(".highlight"),
    ).toBeTruthy()
    // Exactly once: ngAfterViewInit and ngOnChanges each schedule a deferred
    // scroll, and scheduling both would scroll twice per open.
    expect(scrollSpy).toHaveBeenCalledTimes(1)
  })

  it("should render bookmark icon for bookmarked chapters", () => {
    const compiled = fixture.nativeElement as HTMLElement
    const icons = compiled.querySelectorAll(".bookmark-icon")
    expect(icons.length).toBe(1)

    const firstChapterButton = compiled.querySelector(".chapterSelectorButton")
    expect(firstChapterButton?.querySelector(".bookmarked")).toBeTruthy()
    expect(firstChapterButton?.querySelector(".bookmark-icon")).toBeTruthy()
  })

  it("should not render bookmark icon for non-bookmarked chapters", () => {
    const compiled = fixture.nativeElement as HTMLElement
    const buttons = compiled.querySelectorAll(".chapterSelectorButton")
    const secondChapterButton = buttons[1]
    expect(secondChapterButton.querySelector(".bookmark-icon")).toBeFalsy()
    expect(secondChapterButton.querySelector(".bookmarked")).toBeFalsy()
  })

  // The theme's tone for the ribbon, not the stored name: a template bound
  // to the stored colour would paint plain CSS red.
  it("paints a ribbon in the theme's tone, its number on it", () => {
    const host = fixture.nativeElement as HTMLElement
    const icon = host.querySelector(".bookmark-icon") as HTMLElement
    expect(icon.getAttribute("style")).toContain("var(--ribbon-red)")
    expect(host.querySelector(".bookmarked.on-ribbon")).toBeTruthy()
  })

  // A colour stored before the ribbons is painted as stored, and its number
  // keeps the text's colour: --ribbon-text is only right on the ribbons' tones.
  it("leaves a colour from before the ribbons as it was", () => {
    _bookmarkServiceSpy.getBookmarksForBook.and.returnValue(
      of([{ bookId: "EXO", chapter: 1, color: "gold", timestamp: 123 }]),
    )
    fixture.componentRef.setInput("bookId", "EXO")
    fixture.detectChanges()

    const host = fixture.nativeElement as HTMLElement
    const icon = host.querySelector(".bookmark-icon") as HTMLElement
    expect(icon.style.color).toBe("gold")
    expect(host.querySelector(".bookmarked")).toBeTruthy()
    expect(host.querySelector(".on-ribbon")).toBeFalsy()
  })

  // `font-size: large` is an absolute keyword: the chapter titles ignored the
  // font setting while everything around them scaled.
  it("scales the chapter buttons with the inherited font size", () => {
    const host = fixture.nativeElement as HTMLElement
    const button = host.querySelector(".chapterSelectorButton") as HTMLElement

    host.style.fontSize = "10px"
    const small = Number.parseFloat(getComputedStyle(button).fontSize)
    host.style.fontSize = "20px"
    const large = Number.parseFloat(getComputedStyle(button).fontSize)

    expect(large).toBeCloseTo(small * 2, 1)
  })

  // The drawer sits inside the reader, which already ends above the
  // navigation bar: padding the list for the inset again left a large blank
  // space below the last row.
  it("does not pad the list for the bottom system inset", () => {
    const host = fixture.nativeElement as HTMLElement
    const list = host.querySelector(".chapterSelectorContainer") as HTMLElement

    host.style.setProperty("--app-inset-bottom", "100px")
    expect(getComputedStyle(list).paddingBottom).toBe("0px")
  })
})

@Component({
  imports: [MatSidenavModule, ChapterSelectorComponent],
  template: `
    <mat-drawer-container>
      <mat-drawer mode="over">
        <chapter-selector [chapters]="chapters" [selectedChapter]="2"
          bookId="GEN"></chapter-selector>
      </mat-drawer>
    </mat-drawer-container>
  `,
})
class DrawerHostComponent {
  chapters: Chapter[] = [
    { bookId: "GEN", number: 1, title: "Creation" },
    { bookId: "GEN", number: 2, title: "Eden" },
  ]
  @ViewChild(MatDrawer) drawer!: MatDrawer
}

describe("ChapterSelectorComponent in the reader's drawer", () => {
  beforeEach(() => {
    const bookmarks = jasmine.createSpyObj("BookmarkService", [
      "getBookmarksForBook",
    ])
    bookmarks.getBookmarksForBook.and.returnValue(of([]))
    TestBed.configureTestingModule({
      imports: [DrawerHostComponent],
      providers: [
        { provide: BookmarkService, useValue: bookmarks },
        {
          provide: MATERIAL_ANIMATIONS,
          useValue: { animationsDisabled: true },
        },
      ],
    })
  })

  // Reopening the drawer reuses the list, scrolled wherever it was left.
  it("scrolls to the selected chapter each time the drawer opens", fakeAsync(() => {
    const fixture = TestBed.createComponent(DrawerHostComponent)
    const scrollSpy = spyOn(Element.prototype, "scrollIntoView")
    fixture.detectChanges()
    flush()
    const drawer = fixture.componentInstance.drawer
    const selected = (fixture.nativeElement as HTMLElement).querySelector(
      ".highlight",
    )
    expect(selected?.textContent).toContain("Eden")

    drawer.open()
    flush()
    drawer.close()
    flush()
    drawer.open()
    flush()

    expect(scrollSpy).toHaveBeenCalledTimes(2)
    expect(
      scrollSpy.calls.all().every((call) => call.object === selected),
    ).toBe(true)
  }))
})
