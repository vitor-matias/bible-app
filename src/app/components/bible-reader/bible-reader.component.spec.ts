import { provideHttpClient } from "@angular/common/http"
import { type ComponentFixture, TestBed } from "@angular/core/testing"
import { provideRouter } from "@angular/router"

import { BibleReaderComponent } from "./bible-reader.component"

describe("BibleReaderComponent", () => {
  let component: BibleReaderComponent
  let fixture: ComponentFixture<BibleReaderComponent>

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [BibleReaderComponent],
      providers: [provideRouter([]), provideHttpClient()],
    }).compileComponents()

    fixture = TestBed.createComponent(BibleReaderComponent)
    component = fixture.componentInstance
    fixture.detectChanges()
  })

  it("should create", () => {
    expect(component).toBeTruthy()
  })

  it("should initialize books as empty array", () => {
    expect(component.books).toBeDefined()
    expect(Array.isArray(component.books)).toBe(true)
  })

  it("should not call getBooks() method in template (method should not exist)", () => {
    expect((component as any).getBooks).toBeUndefined()
  })
})
