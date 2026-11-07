import { DOCUMENT } from "@angular/core"
import { TestBed } from "@angular/core/testing"
import type {
  ActivatedRouteSnapshot,
  CanActivateFn,
  RouterStateSnapshot,
} from "@angular/router"
import { routes } from "./app.routes"
import { APP_STORE_URL, PLAY_STORE_URL } from "./store-redirect.guard"

describe("store redirects", () => {
  const replace = vi.fn()

  beforeEach(() => {
    replace.mockReset()
    TestBed.configureTestingModule({
      providers: [{ provide: DOCUMENT, useValue: { location: { replace } } }],
    })
  })

  for (const [path, url] of [
    ["android", PLAY_STORE_URL],
    ["ios", APP_STORE_URL],
  ]) {
    it(`/${path} leaves for its store listing`, () => {
      const route = routes.find((r) => r.path === path)
      const guard = route?.canActivate?.[0] as CanActivateFn
      const allowed = TestBed.runInInjectionContext(() =>
        guard({} as ActivatedRouteSnapshot, {} as RouterStateSnapshot),
      )
      expect(allowed).toBe(false)
      expect(replace).toHaveBeenCalledWith(url)
    })
  }
})
