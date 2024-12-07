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
    fixture.detectChanges()
  })

  it("should create", () => {
    expect(component).toBeTruthy()
  })
})
