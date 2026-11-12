import {
  APP_ID,
  Component,
  ɵJSACTION_BLOCK_ELEMENT_MAP as JSACTION_BLOCK_ELEMENT_MAP,
} from "@angular/core"
import { TestBed } from "@angular/core/testing"
import { provideHydration } from "./config"

@Component({ template: `<button type="button" (click)="(0)">x</button>` })
class WithListener {}

describe("provideHydration", () => {
  type EarlyContract = { _ejsas?: Record<string, unknown> }

  afterEach(() => {
    delete (window as EarlyContract)._ejsas
  })

  it("does not keep elements rendered after hydration alive", () => {
    // What a prerendered page's inline event contract leaves for the app,
    // which is what switches event replay on.
    ;(window as EarlyContract)._ejsas = { page: {} }
    TestBed.configureTestingModule({
      providers: [provideHydration(), { provide: APP_ID, useValue: "page" }],
    })

    const fixture = TestBed.createComponent(WithListener)
    fixture.detectChanges()
    fixture.destroy()

    const kept = [...TestBed.inject(JSACTION_BLOCK_ELEMENT_MAP).values()]
    expect(kept.flatMap((elements) => [...elements])).toEqual([])
  })
})
