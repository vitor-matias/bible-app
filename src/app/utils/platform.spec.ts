import { isBrowser } from "./platform"

describe("isBrowser", () => {
  // The negative case only exists in the prerender worker, which has neither
  // global; the guards that call this are covered by the server-rendering
  // specs of their own consumers (ThemeService, KeepAwakeService, the reader).
  it("is true in a browser", () => {
    expect(isBrowser()).toBeTrue()
  })
})
