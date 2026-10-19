import { copyFile, readdir } from "node:fs/promises"
import sharp from "sharp"

// A green "WEB" sash across the top-right of the icons the website installs
// with (the manifest's maskable icons, also the iPhone's apple-touch-icon), so
// the installed website reads apart from the native apps on a home screen.
// Stamped in place; a second run is a no-op. The browser tab's favicon and
// the round "any" icon (also onboarding's logo) stay plain.
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
const FAVICON = `${ICONS}/favicon_x128.png`

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

/** True when the band is already there: a point on it, past the word. */
async function isStamped(file, size) {
  const k = 1 - DIST * Math.SQRT2
  const along = (0.2 * size) / Math.SQRT2
  const x = Math.round(size - (k * size) / 2 + along)
  const y = Math.round((k * size) / 2 + along)
  const data = await sharp(file)
    .extract({ left: Math.min(x, size - 1), top: Math.min(y, size - 1), width: 1, height: 1 })
    .raw()
    .toBuffer()
  return Math.abs(data[0] - 0x2e) < 8 && Math.abs(data[1] - 0x7d) < 8 && Math.abs(data[2] - 0x32) < 8
}

async function stamp(file) {
  const { width } = await sharp(file).metadata()
  if (await isStamped(file, width)) {
    console.log(`Already stamped: ${file}`)
    return
  }
  const out = await sharp(file)
    .composite([{ input: sash(width) }])
    .png()
    .toBuffer()
  await sharp(out).toFile(file)
  console.log(`Stamped ${file}`)
}

// The tab keeps the plain icon: copy it out before the first stamp.
const plain128 = `${ICONS}/maskable_icon_x128.png`
const { width: w128 } = await sharp(plain128).metadata()
if (!(await isStamped(plain128, w128))) await copyFile(plain128, FAVICON)

for (const name of await readdir(ICONS)) {
  if (/^maskable_icon_x\d+\.png$/.test(name)) await stamp(`${ICONS}/${name}`)
}
