import { type ComponentFixture, TestBed } from "@angular/core/testing"

import { VerseSectionComponent } from "./verse-section.component"

describe("VerseSectionComponent", () => {
  let component: VerseSectionComponent
  let fixture: ComponentFixture<VerseSectionComponent>

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [VerseSectionComponent],
    }).compileComponents()

    fixture = TestBed.createComponent(VerseSectionComponent)
    component = fixture.componentInstance
    component.data = {
      text: [{ type: "text", text: "In the beginning..." }],
      number: 1,
      verseLabel: "1",
      bookId: "gen",
      chapterNumber: 1,
    }
    fixture.detectChanges()
  })

  it("should create", () => {
    expect(component).toBeTruthy()
  })
})
