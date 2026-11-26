import { signal } from "@angular/core"
import { type ComponentFixture, TestBed } from "@angular/core/testing"
import { MatDialog } from "@angular/material/dialog"
import { provideRouter } from "@angular/router"
import { Subject } from "rxjs"
import { Mais365Service } from "../../services/mais365.service"
import { Mais365ReminderService } from "../../services/mais365-reminder.service"
import { NativeChromeService } from "../../services/native-chrome.service"
import { lastCall } from "../../testing/spy-obj"
import { Mais365Component } from "./mais365.component"

// The apps' bars over the page: their title, and the reminder's bell.
describe("Mais365Component in the apps' bars", () => {
  let fixture: ComponentFixture<Mais365Component>
  const actions = new Subject<{ id: string }>()
  const reminderEnabled = signal(false)
  const chrome = {
    enabled: true,
    android: false,
    actions$: actions,
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
        // The bell's state only: the reminder itself isn't this spec's.
        {
          provide: Mais365ReminderService,
          useValue: { enabled: reminderEnabled },
        },
      ],
    })
    fixture = TestBed.createComponent(Mais365Component)
    document.body.append(fixture.nativeElement)
    await fixture.whenStable()
  }

  afterEach(() => (fixture.nativeElement as HTMLElement).remove())

  // The podcast's cover leads the page: no large title of its own on iOS,
  // the bar's small one from the top, as on Android.
  it.each([false, true])(
    "leaves the title to the bar (Android: %s)",
    async (android) => {
      await create(android)
      expect(title()).toBeNull()
      expect(lastCall(chrome.show)[0]).toEqual({
        mode: "page",
        themeMode: expect.any(String),
        title: "+365",
        search: false,
        reminder: false,
      })
    },
  )

  // A proper bar button in the apps, as their ··· and search: not the web's.
  it("puts the reminder's bell in the bar, rings it, and opens it from there", async () => {
    reminderEnabled.set(false)
    await create(false)
    expect(
      (fixture.nativeElement as HTMLElement).querySelector(".bell"),
    ).toBeNull()
    expect(lastCall(chrome.show)[0].reminder).toBe(false)
    const open = vi
      .spyOn(TestBed.inject(MatDialog), "open")
      .mockReturnValue({} as never)
    actions.next({ id: "reminder" })
    expect(open).toHaveBeenCalled()
    reminderEnabled.set(true)
    TestBed.tick()
    expect(lastCall(chrome.show)[0].reminder).toBe(true)
  })
})
