import { contrastRatio } from "./contrast"

describe("contrastRatio", () => {
  it("is 21:1 for black on white", () => {
    expect(contrastRatio("rgb(0, 0, 0)", "rgb(255, 255, 255)")).toBeCloseTo(
      21,
      1,
    )
  })

  // A 12% white label on #333 read as opaque white (12.6:1) and passed.
  it("paints a translucent foreground over the background", () => {
    expect(
      contrastRatio("rgba(255, 255, 255, 0.12)", "rgb(51, 51, 51)"),
    ).toBeLessThan(1.6)
  })

  it("reads the color(srgb …) Chrome computes a color-mix() to", () => {
    expect(contrastRatio("color(srgb 1 1 1)", "rgb(0, 0, 0)")).toBeCloseTo(
      21,
      1,
    )
    expect(
      contrastRatio("color(srgb 1 1 1 / 0.12)", "rgb(51, 51, 51)"),
    ).toBeLessThan(1.6)
  })
})
