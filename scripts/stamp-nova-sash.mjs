import { readdir } from "node:fs/promises"
import sharp from "sharp"

// A red "NOVA" sash (as in "nova aplicação") across the top-right of the
// native apps' icons, for the launch: it tells them apart from the website
// installed to the home screen, which keeps the plain icon. Run by
// `npm run cap:icons` after
// @capacitor/assets, which would otherwise overwrite it. To retire it, drop
// this script from cap:icons and run that again.
//
// The band sits well inside the icon rather than hugging the corner, so the
// word stays whole under round Android launcher masks as well as the iPhone's
// rounded square. "NOVA" is set in the system's Helvetica Neue (macOS), as the
// rest of the pipeline is run there.

const RED = "#C62828"
// The band's centre line runs at 45° across the top-right, this far from the
// artwork's centre (as a fraction of its size). A round mask has radius 0.5.
const DIST = 0.36
const BAND = 0.146
const TEXT = 0.086

const IOS_ICON = "ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png"
const ANDROID_RES = "android/app/src/main/res"

/** The sash for a canvas whose artwork fills the square at (x, y), side s. */
function sash(canvas, { x, y, s }) {
  const k = 1 - DIST * Math.SQRT2 // where the line meets the top and right edges
  const cx = x + s - (k * s) / 2
  const cy = y + (k * s) / 2
  const band = BAND * s
  const size = TEXT * s
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${canvas}" height="${canvas}">
  <g transform="translate(${cx} ${cy}) rotate(45)">
    <rect x="${-s}" y="${-band / 2}" width="${2 * s}" height="${band}" fill="${RED}"/>
    <text y="0" dy="0.35em" text-anchor="middle" font-family="Helvetica Neue, Helvetica, Arial, sans-serif"
      font-weight="700" font-size="${size}" letter-spacing="${size / 8}" fill="#FFFFFF">NOVA</text>
  </g>
</svg>`)
}

/**
 * The square the opaque artwork fills: legacy launcher icons carry a margin.
 * The artwork is a centred square, rounded or round, so its middle row spans
 * its full width even where its corners are transparent.
 */
async function artworkBox(file) {
  const { data, info } = await sharp(file)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  const mid = Math.floor(info.width / 2)
  let left = info.width
  let right = -1
  for (let x = 0; x < info.width; x++) {
    if (data[(mid * info.width + x) * 4 + 3] > 8) {
      left = Math.min(left, x)
      right = Math.max(right, x)
    }
  }
  return { canvas: info.width, box: { x: left, y: left, s: right - left + 1 } }
}

/** True when the band is already there, so a second run adds nothing. */
async function isStamped(file) {
  const { canvas, box } = await artworkBox(file)
  const k = 1 - DIST * Math.SQRT2
  // On the band, past the end of the word.
  const along = 0.22 * box.s
  const x = Math.round(box.x + box.s - (k * box.s) / 2 + along / Math.SQRT2)
  const y = Math.round(box.y + (k * box.s) / 2 + along / Math.SQRT2)
  const data = await sharp(file)
    .ensureAlpha()
    .extract({ left: Math.min(x, canvas - 1), top: Math.min(y, canvas - 1), width: 1, height: 1 })
    .raw()
    .toBuffer()
  return Math.abs(data[0] - 0xc6) < 6 && Math.abs(data[1] - 0x28) < 6 && Math.abs(data[2] - 0x28) < 6
}

async function stamp(file) {
  if (await isStamped(file)) {
    console.log(`Already stamped: ${file}`)
    return
  }
  const { canvas, box } = await artworkBox(file)
  // "atop" paints only over the artwork, never into transparent corners.
  const out = await sharp(file)
    .composite([{ input: sash(canvas, box), blend: "atop" }])
    .png()
    .toBuffer()
  await sharp(out).toFile(file)
  console.log(`Stamped ${file}`)
}

const files = [IOS_ICON]
for (const dir of await readdir(ANDROID_RES)) {
  if (!dir.startsWith("mipmap-") || dir.includes("anydpi")) continue
  for (const name of ["ic_launcher.png", "ic_launcher_round.png", "ic_launcher_foreground.png"]) {
    files.push(`${ANDROID_RES}/${dir}/${name}`)
  }
}
for (const file of files) await stamp(file)
