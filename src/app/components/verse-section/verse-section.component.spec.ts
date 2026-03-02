import { type ComponentFixture, TestBed } from "@angular/core/testing"
import { provideRouter } from "@angular/router"
import { SimpleChange } from "@angular/core"
import { MatSnackBar, MatSnackBarModule } from "@angular/material/snack-bar"
import { BibleReferenceService } from "../../services/bible-reference.service"
import { BookService } from "../../services/book.service"
import { VerseSectionComponent } from "./verse-section.component"

function makeVerse(overrides: Partial<Verse> = {}): Verse {
  return {
    bookId: "gen",
    chapterNumber: 1,
    number: 1,
    verseLabel: "1",
    text: [{ type: "text", text: "In the beginning..." }],
    ...overrides,
  }
}

function setData(component: VerseSectionComponent, data: Verse): void {
  const prev = component.data
  component.data = data
  component.ngOnChanges({
    data: new SimpleChange(prev, data, prev === undefined),
  })
}

describe("VerseSectionComponent", () => {
  let component: VerseSectionComponent
  let fixture: ComponentFixture<VerseSectionComponent>
  let mockBibleRef: jasmine.SpyObj<BibleReferenceService>
  let mockSnackBar: jasmine.SpyObj<MatSnackBar>
  let mockBookService: jasmine.SpyObj<BookService>

  beforeEach(async () => {
    mockBibleRef = jasmine.createSpyObj("BibleReferenceService", ["extract"])
    mockBibleRef.extract.and.returnValue([])

    mockSnackBar = jasmine.createSpyObj("MatSnackBar", ["openFromComponent"])

    mockBookService = jasmine.createSpyObj("BookService", [
      "findBook",
      "getUrlAbrv",
    ])
    mockBookService.findBook.and.returnValue({
      id: "gen",
      shortName: "Gn",
      abrv: "Gn",
      name: "Génesis",
      chapterCount: 50,
    } as Book)
    mockBookService.getUrlAbrv.and.returnValue("gn")

    await TestBed.configureTestingModule({
      imports: [VerseSectionComponent, MatSnackBarModule],
      providers: [
        provideRouter([]),
        { provide: BibleReferenceService, useValue: mockBibleRef },
        { provide: BookService, useValue: mockBookService },
      ],
    }).compileComponents()

    fixture = TestBed.createComponent(VerseSectionComponent)
    component = fixture.componentInstance
    mockSnackBar = (component as any).snackBar
    spyOn(mockSnackBar, "openFromComponent")
  })

  it("should create", () => {
    component.changeLine = false
    setData(component, makeVerse())
    fixture.detectChanges()
    expect(component).toBeTruthy()
  })

  describe("ngOnChanges — parsedReferences", () => {
    it("should pre-compute references for reference-type text entries", () => {
      component.changeLine = false
      setData(
        component,
        makeVerse({
          text: [
            { type: "text", text: "verse" },
            { type: "references", text: "Gn 1,1" },
          ],
        }),
      )

      expect(component.parsedReferences.has(1)).toBe(true)
      expect(component.parsedReferences.get(1)!.length).toBeGreaterThan(0)
    })

    it("should not create entries for non-reference text types", () => {
      component.changeLine = false
      setData(
        component,
        makeVerse({
          text: [
            { type: "text", text: "plain" },
            { type: "section", tag: "s2", text: "title" },
          ],
        }),
      )

      expect(component.parsedReferences.size).toBe(0)
    })

    it("should recompute when data input changes", () => {
      component.changeLine = false
      setData(
        component,
        makeVerse({ text: [{ type: "references", text: "Gn 1,1" }] }),
      )

      expect(component.parsedReferences.has(0)).toBe(true)

      // Change data
      setData(
        component,
        makeVerse({ text: [{ type: "text", text: "no refs" }] }),
      )

      expect(component.parsedReferences.size).toBe(0)
    })
  })

  describe("showReturnSnackbar", () => {
    it("should open snackbar with return location info", () => {
      component.changeLine = false
      setData(
        component,
        makeVerse({ bookId: "gen", chapterNumber: 3, number: 5 }),
      )

      component.showReturnSnackbar()
      expect(mockSnackBar.openFromComponent).toHaveBeenCalled()
    })

    it("should use verse 1 when verse number is 0", () => {
      component.changeLine = false
      setData(
        component,
        makeVerse({ bookId: "gen", chapterNumber: 1, number: 0 }),
      )

      component.showReturnSnackbar()

      const callArgs = mockSnackBar.openFromComponent.calls.mostRecent().args[1]
      expect((callArgs?.data as { message: string }).message).toContain(",1")
    })
  })

  describe("getVerseQueryParams", () => {
    it("should be the shared utility function", () => {
      expect(component.getVerseQueryParams).toBeDefined()
      expect(component.getVerseQueryParams([])).toBeNull()
      expect(
        component.getVerseQueryParams([{ type: "single", verse: 3 }]),
      ).toEqual({ verseStart: 3 })
    })
  })
})
