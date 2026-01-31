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
})
