/** The channels of a computed `rgb()`/`rgba()` colour, alpha last. */
function channels(cssColor: string): [number, number, number, number] {
  const [r, g, b, a = 1] = (cssColor.match(/[\d.]+/g) ?? []).map(Number)
  return [r, g, b, a]
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
 * first painted over `under`, the opaque colour it sits on.
 */
export function contrastRatio(
  foreground: string,
  background: string,
  under = "rgb(255, 255, 255)",
): number {
  const [r, g, b, alpha] = channels(background)
  const base = channels(under)
  const painted = [r, g, b].map(
    (channel, i) => channel * alpha + base[i] * (1 - alpha),
  )
  const [lighter, darker] = [
    luminance(channels(foreground)),
    luminance(painted),
  ].sort((a, b) => b - a)
  return (lighter + 0.05) / (darker + 0.05)
}
