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

  // The reader header pins its buttons 8px from the viewport edge. This toolbar
  // lays its buttons out in flow instead, so Material's own 16px toolbar inset
  // stacked on .content's 8px and left them 24px in — visibly out of line with
  // every other page.
  it("insets its buttons like the reader header, not 16px further in", () => {
    const element = fixture.nativeElement as HTMLElement
    const toolbar = element.querySelector("mat-toolbar") as HTMLElement
    const content = element.querySelector(".content") as HTMLElement

    const toolbarStyle = getComputedStyle(toolbar)
    expect(toolbarStyle.paddingLeft).toBe("0px")
    expect(toolbarStyle.paddingRight).toBe("0px")

    const contentStyle = getComputedStyle(content)
    expect(contentStyle.paddingLeft).toBe("8px")
    expect(contentStyle.paddingRight).toBe("8px")
  })

  it("should create", () => {
    expect(component).toBeTruthy()
  })
})
