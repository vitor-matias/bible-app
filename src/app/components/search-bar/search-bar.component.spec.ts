import { type ComponentFixture, TestBed } from "@angular/core/testing"
import { SearchBarComponent } from "./search-bar.component"

describe("SearchBarComponent", () => {
  let component: SearchBarComponent
  let fixture: ComponentFixture<SearchBarComponent>

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SearchBarComponent],
    }).compileComponents()

    fixture = TestBed.createComponent(SearchBarComponent)
    component = fixture.componentInstance
  })

  it("should create", () => {
    fixture.detectChanges()

    expect(component).toBeTruthy()
  })

  it("should apply the initial query even when it is an empty string", () => {
    component.initialQuery = ""
    component.query = "existing value"

    component.ngOnInit()

    expect(component.query).toBe("")
  })
})
