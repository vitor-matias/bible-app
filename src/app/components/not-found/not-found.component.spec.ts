import { TestBed } from "@angular/core/testing"
import { Meta } from "@angular/platform-browser"
import { provideRouter, Router } from "@angular/router"
import { Subject } from "rxjs"
import type { NativeChromeAction } from "../../services/native-chrome.types"
import { NativeChromeService } from "../../services/native-chrome.service"
import { ThemeService } from "../../services/theme.service"
import { NotFoundComponent } from "./not-found.component"

describe("NotFoundComponent", () => {
  it("says so, links to the book list and is noindexed", () => {
    TestBed.configureTestingModule({ providers: [provideRouter([])] })
    const fixture = TestBed.createComponent(NotFoundComponent)
    fixture.detectChanges()
    const el: HTMLElement = fixture.nativeElement
    expect(el.querySelector("h1")?.textContent).toBe("Capítulo não encontrado")
    expect(el.querySelector("a")?.getAttribute("href")).toBe("/livros")
    expect(TestBed.inject(Meta).getTag('name="robots"')?.content).toBe(
      "noindex",
    )
  })

  // With no bars asked for, the Android status bar kept the web header's
  // white icons over this cream page, and only system Back led away.
  describe("in the apps", () => {
    const actions = new Subject<NativeChromeAction>()
    const nativeChrome = {
      enabled: true,
      actions$: actions,
      show: vi.fn(),
      hide: vi.fn(),
    }

    beforeEach(() => {
      nativeChrome.show.mockClear()
      nativeChrome.hide.mockClear()
      TestBed.configureTestingModule({
        providers: [
          provideRouter([]),
          { provide: NativeChromeService, useValue: nativeChrome },
          { provide: ThemeService, useValue: { currentMode: "light" } },
        ],
      })
    })

    it("shows the native bars, with Back and search, and hides them after", () => {
      const fixture = TestBed.createComponent(NotFoundComponent)
      fixture.detectChanges()
      expect(nativeChrome.show).toHaveBeenCalledWith({
        mode: "page",
        themeMode: "light",
        title: "Bíblia Sagrada",
        search: true,
      })

      const navigate = vi
        .spyOn(TestBed.inject(Router), "navigate")
        .mockResolvedValue(true)
      actions.next({ id: "back" })
      actions.next({ id: "search" })
      expect(navigate).toHaveBeenCalledWith(["/"])
      expect(navigate).toHaveBeenCalledWith(["/search"])

      fixture.destroy()
      expect(nativeChrome.hide).toHaveBeenCalled()
    })
  })
})
