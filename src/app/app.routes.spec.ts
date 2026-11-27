import { Location } from "@angular/common"
import { signal } from "@angular/core"
import { TestBed } from "@angular/core/testing"
import { provideRouter, type Route } from "@angular/router"
import { RouterTestingHarness } from "@angular/router/testing"
import { routes } from "./app.routes"
import { MAIS365_BOOK } from "./bible-canon"
import { BibleReaderComponent } from "./components/bible-reader/bible-reader.component"
import { NotFoundComponent } from "./components/not-found/not-found.component"
import { Mais365ReminderService } from "./services/mais365-reminder.service"
import { NativeChromeService } from "./services/native-chrome.service"

describe("app routes", () => {
  // They opened the About page and rewrote the address to /sobre/1.
  for (const url of ["/xyz", "/jo/3/4"]) {
    it(`${url} shows the not-found page and keeps its address`, async () => {
      TestBed.configureTestingModule({ providers: [provideRouter(routes)] })
      const harness = await RouterTestingHarness.create()

      await harness.navigateByUrl(url, NotFoundComponent)

      expect(TestBed.inject(Location).path()).toBe(url)
    })
  }

  // The web hosts the +365 plan in the reader, under its header (it showed
  // none); the apps keep its own page, under their bars.
  it("opens the +365 plan in the reader on the web, the page itself natively", () => {
    const [web, native] = routes.filter((route) => route.path === "mais365")

    expect(web.component).toBe(BibleReaderComponent)
    expect(web.resolve?.["indexPage"]).toBe(native.loadComponent)
    expect(web.data?.["pageBook"]).toBe(MAIS365_BOOK)
    TestBed.configureTestingModule({
      providers: [
        { provide: NativeChromeService, useValue: { enabled: true } },
      ],
    })
    const [canMatch] = (web.canMatch ?? []) as (() => boolean)[]
    expect(TestBed.runInInjectionContext(canMatch)).toBe(false)
    expect(native.canMatch).toBeUndefined()
  })

  // Its first address, /365, in links already shared.
  it("takes /365 to /mais365", async () => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter(routes),
        // The page's bell reads it; its push needs a service worker.
        {
          provide: Mais365ReminderService,
          useValue: { enabled: signal(false) },
        },
      ],
    })
    const harness = await RouterTestingHarness.create()

    await harness.navigateByUrl("/365")

    expect(TestBed.inject(Location).path()).toBe("/mais365")
  })

  // The web hosts the index in the reader; the native apps keep its own page.
  describe("the Índice Bíblico-Pastoral", () => {
    const at = (path: string) => routes.filter((route) => route.path === path)

    const matches = (route: Route, native: boolean): boolean => {
      TestBed.configureTestingModule({
        providers: [
          { provide: NativeChromeService, useValue: { enabled: native } },
        ],
      })
      const [canMatch] = (route.canMatch ?? []) as (() => boolean)[]
      return canMatch ? TestBed.runInInjectionContext(canMatch) : true
    }

    for (const path of ["indice", "indice/:slug"]) {
      it(`${path} opens in the reader on the web, the page itself natively`, () => {
        const [web, native] = at(path)

        expect(web.component).toBe(BibleReaderComponent)
        expect(web.resolve?.["indexPage"]).toBe(native.loadComponent)
        expect(web.data?.["index"]).toBe(true)
        expect(native.data).toBeUndefined()
        expect(matches(web, false)).toBe(true)
        TestBed.resetTestingModule()
        expect(matches(web, true)).toBe(false)
        expect(native.canMatch).toBeUndefined()
      })
    }

    // "/indice/amor" has two segments, as a chapter's address does.
    it("comes before a chapter's address", () => {
      const chapter = routes.findIndex(
        (route) => route.path === ":book/:chapter",
      )
      for (const route of [...at("indice"), ...at("indice/:slug")]) {
        expect(routes.indexOf(route)).toBeLessThan(chapter)
      }
    })
  })
})
