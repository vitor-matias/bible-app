import { readdir } from "node:fs/promises"
import sharp from "sharp"

// A green "WEB" sash across the top-right of the icons the website installs
// with, so the installed website reads apart from the native apps on a home
// screen. Writes maskable_web_icon_x<N>.png from each plain
// maskable_icon_x<N>.png; the manifest's maskable icons and the iPhone's
// apple-touch-icon point at the stamped copies. The browser tab's favicon and
// the round "any" icon (also onboarding's logo) stay plain.
//
// New file names, not stamped originals: production serves icons as
// immutable for a year, so an icon changed in place could stay stale in
// browsers, and in Chrome's check for an installed app's new icon.
//
// Maskable icons are cropped by the launcher, which only promises the circle
// of radius 40% around the centre, so the band sits further in than a corner
// sash would: the word stays whole inside that circle. "WEB" is set in the
// system's Helvetica Neue (macOS).

const GREEN = "#2E7D32"
// The band's centre line runs at 45° across the top-right, this far from the
// icon's centre (as a fraction of its size).
const DIST = 0.3
const BAND = 0.146
const TEXT = 0.086

const ICONS = "public/icons"

function sash(size) {
  const k = 1 - DIST * Math.SQRT2 // where the line meets the top and right edges
  const c = (k * size) / 2
  const band = BAND * size
  const text = TEXT * size
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
  <g transform="translate(${size - c} ${c}) rotate(45)">
    <rect x="${-size}" y="${-band / 2}" width="${2 * size}" height="${band}" fill="${GREEN}"/>
    <text y="0" dy="0.35em" text-anchor="middle" font-family="Helvetica Neue, Helvetica, Arial, sans-serif"
      font-weight="700" font-size="${text}" letter-spacing="${text / 8}" fill="#FFFFFF">WEB</text>
  </g>
</svg>`)
}

for (const name of await readdir(ICONS)) {
  const match = /^maskable_icon_x(\d+)\.png$/.exec(name)
  if (!match) continue
  const source = `${ICONS}/${name}`
  const target = `${ICONS}/maskable_web_icon_x${match[1]}.png`
  const { width } = await sharp(source).metadata()
  await sharp(source)
    .composite([{ input: sash(width) }])
    .png()
    .toFile(target)
  console.log(`Wrote ${target}`)
}
