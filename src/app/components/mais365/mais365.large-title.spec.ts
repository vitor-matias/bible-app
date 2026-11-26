import { signal } from "@angular/core"
import { type ComponentFixture, TestBed } from "@angular/core/testing"
import { provideRouter } from "@angular/router"
import { EMPTY } from "rxjs"
import { Mais365Service } from "../../services/mais365.service"
import { NativeChromeService } from "../../services/native-chrome.service"
import { lastCall } from "../../testing/spy-obj"
import { Mais365Component } from "./mais365.component"

// The iOS app's large title: the page draws it, and tells the bar whether
// it is in sight, so that the bar shows its own title only once it isn't.
describe("Mais365Component's large title", () => {
  let fixture: ComponentFixture<Mais365Component>
  const chrome = {
    enabled: true,
    android: false,
    actions$: EMPTY,
    show: vi.fn(),
    hide: vi.fn(),
  }
  // No days: the title doesn't wait for the plan.
  const plan = {
    plan: {
      isLoading: signal(false),
      error: signal(undefined),
      reload: vi.fn(),
    },
    days: signal([]),
    done: signal([]),
    streak: signal(0),
    milestone: signal(null),
    celebrate: vi.fn(),
    today: signal(undefined),
    active: signal(null),
    stage: signal(null),
    load: vi.fn(),
  }
  const title = () =>
    (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>(
      ".large-title",
    )

  async function create(android: boolean): Promise<void> {
    chrome.android = android
    chrome.show.mockClear()
    TestBed.configureTestingModule({
      imports: [Mais365Component],
      providers: [
        provideRouter([]),
        { provide: NativeChromeService, useValue: chrome },
        { provide: Mais365Service, useValue: plan },
      ],
    })
    fixture = TestBed.createComponent(Mais365Component)
    document.body.append(fixture.nativeElement)
    await fixture.whenStable()
  }

  afterEach(() => (fixture.nativeElement as HTMLElement).remove())

  it("leads the iOS page, and holds the bar's title back", async () => {
    await create(false)
    expect(title()?.textContent).toBe("+365")
    expect(lastCall(chrome.show)[0]).toEqual({
      mode: "page",
      themeMode: expect.any(String),
      title: "+365",
      search: false,
      largeTitle: true,
    })
  })

  it("gives the title to the bar once scrolled under it, and takes it back", async () => {
    await create(false)
    const heading = title() as HTMLElement
    heading.style.display = "none"
    await vi.waitFor(() =>
      expect(lastCall(chrome.show)[0].largeTitle).toBe(false),
    )
    heading.style.display = ""
    await vi.waitFor(() =>
      expect(lastCall(chrome.show)[0].largeTitle).toBe(true),
    )
  })

  it("is not on Android, whose bar keeps its title", async () => {
    await create(true)
    expect(title()).toBeNull()
    expect(lastCall(chrome.show)[0].largeTitle).toBeUndefined()
  })
})
