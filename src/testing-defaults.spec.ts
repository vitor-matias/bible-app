import { TestBed } from "@angular/core/testing"
import { WEB_BARS } from "./app/services/native-chrome.service"

/*
 * Defaults for every spec. A beforeEach outside any describe runs before each
 * spec's own setup, which can still override what it provides.
 *
 * The web app draws its bars on phone-sized screens (WEB_BARS), and Karma's
 * page may be that narrow: off by default, so specs don't depend on the size
 * of their window. Specs of the bars provide WEB_BARS themselves.
 */
beforeEach(() => {
  TestBed.configureTestingModule({
    providers: [{ provide: WEB_BARS, useValue: false }],
  })
})

describe("spec defaults", () => {
  it("leave the web bars off", () => {
    expect(TestBed.inject(WEB_BARS)).toBeFalse()
  })
})
