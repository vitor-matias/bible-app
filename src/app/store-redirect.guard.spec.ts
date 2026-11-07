import { DOCUMENT } from "@angular/common"
import { TestBed } from "@angular/core/testing"
import type {
  ActivatedRouteSnapshot,
  CanActivateFn,
  RouterStateSnapshot,
} from "@angular/router"
import { routes } from "./app.routes"

describe("store redirects", () => {
  const replace = vi.fn()

  beforeEach(() => {
    replace.mockReset()
    TestBed.configureTestingModule({
      providers: [{ provide: DOCUMENT, useValue: { location: { replace } } }],
    })
  })

  for (const [path, url] of [
    [
      "android",
      "https://play.google.com/store/apps/details?id=org.capuchinhos.biblia",
    ],
    ["ios", "https://apps.apple.com/app/id6823135142"],
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
