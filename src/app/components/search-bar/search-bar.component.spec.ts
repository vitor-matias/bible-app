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
    fixture.detectChanges()
  })

  it("should create", () => {
    expect(component).toBeTruthy()
  })

  it("should prefill the query from the value input", () => {
    component.value = "Salmo 23"
    expect(component.query).withContext("after setter").toBe("Salmo 23")
    fixture.detectChanges()
    expect(component.query).withContext("after CD").toBe("Salmo 23")
  })

  it("should clear the query when value is nullish", () => {
    component.value = "old query"
    expect(component.query).toBe("old query")

    component.value = null as unknown as string
    expect(component.query).toBe("")

    component.value = "another query"
    component.value = undefined as unknown as string
    expect(component.query).toBe("")
  })
})
