import { Location } from "@angular/common"
import { TestBed } from "@angular/core/testing"
import { provideRouter, type Route } from "@angular/router"
import { RouterTestingHarness } from "@angular/router/testing"
import { routes } from "./app.routes"
import { BibleReaderComponent } from "./components/bible-reader/bible-reader.component"
import { NotFoundComponent } from "./components/not-found/not-found.component"
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

  // The apps play +365 with their own player (PodcastChrome).
  it("opens the +365 plan on the web and in the apps", () => {
    const plan = routes.find((route) => route.path === "365") as Route
    expect(plan.canMatch).toBeUndefined()
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
