/**
 * The channels (0–255) of a computed colour, alpha last: `rgb()`/`rgba()`, or
 * the `color(srgb r g b / a)` that Chrome computes a `color-mix()` to.
 */
function channels(cssColor: string): [number, number, number, number] {
  const [r, g, b, a = 1] = (cssColor.match(/[\d.]+/g) ?? []).map(Number)
  const scale = cssColor.startsWith("color(srgb") ? 255 : 1
  return [r * scale, g * scale, b * scale, a]
}

/** `top` painted over the opaque `[r, g, b]` under it. */
function paint(top: string, under: number[]): number[] {
  const [r, g, b, alpha] = channels(top)
  return [r, g, b].map((channel, i) => channel * alpha + under[i] * (1 - alpha))
}

/** WCAG relative luminance of opaque `[r, g, b]` channels. */
function luminance([r, g, b]: number[]): number {
  const [R, G, B] = [r, g, b].map((value) => {
    const channel = value / 255
    return channel <= 0.03928
      ? channel / 12.92
      : ((channel + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * R + 0.7152 * G + 0.0722 * B
}

/**
 * WCAG contrast of `foreground` on `background`. A translucent background is
 * first painted over `under`, the opaque colour it sits on, and a translucent
 * foreground over the background.
 */
export function contrastRatio(
  foreground: string,
  background: string,
  under = "rgb(255, 255, 255)",
): number {
  const painted = paint(background, channels(under))
  const [lighter, darker] = [
    luminance(paint(foreground, painted)),
    luminance(painted),
  ].sort((a, b) => b - a)
  return (lighter + 0.05) / (darker + 0.05)
}
