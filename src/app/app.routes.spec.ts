import { Location } from "@angular/common"
import { TestBed } from "@angular/core/testing"
import { provideRouter } from "@angular/router"
import { RouterTestingHarness } from "@angular/router/testing"
import { routes } from "./app.routes"
import { NotFoundComponent } from "./components/not-found/not-found.component"

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
})
