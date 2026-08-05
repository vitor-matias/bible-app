import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"

// Material Symbols renders icons through ligatures (the element text is the
// icon name), so the full variable font weighs ~3.8 MB. Local subsetting
// can't shrink it: every name is spelled with ordinary letters, so glyph
// closure retains every ligature. Google's css2 endpoint prunes the ligature
// table server-side via icon_names, so we ask it for exactly the icons the
// app uses and commit the resulting font to public/fonts/.
//
// Rerun with `npm run icons:subset` after adding/removing <mat-icon> names.

const NAMES_FILE = "node_modules/material-symbols/index.d.ts"
const OUTPUT_DIR = "public/fonts"
const OUTPUT_FILE = join(OUTPUT_DIR, "material-symbols.woff2")
const AXES = "opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200"
// A modern browser UA is required or the endpoint serves ttf instead of woff2.
const USER_AGENT =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36"

function walk(dir, extensions, files = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) {
      walk(path, extensions, files)
    } else if (extensions.some((ext) => entry.name.endsWith(ext))) {
      files.push(path)
    }
  }
  return files
}

// Every valid icon name, straight from the material-symbols type definitions.
const validNames = new Set(
  [...readFileSync(NAMES_FILE, "utf8").matchAll(/"([^"]+)"/g)].map(
    (match) => match[1],
  ),
)

// Any snake_case literal in a template or component that is a real icon name
// counts as used. False positives (a plain string that happens to be an icon
// name) only cost a few hundred bytes each.
const candidatePattern = /["'>]([a-z0-9_]{2,40})["'<]/g
const usedNames = new Set()
for (const file of walk("src", [".html", ".ts"])) {
  if (file.endsWith(".spec.ts")) continue
  const content = readFileSync(file, "utf8")
  for (const match of content.matchAll(candidatePattern)) {
    if (validNames.has(match[1])) {
      usedNames.add(match[1])
    }
  }
}

if (usedNames.size === 0) {
  console.error("No icon names found in src/ — refusing to write an empty subset.")
  process.exit(1)
}

const names = [...usedNames].sort()
const cssUrl =
  "https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:" +
  `${AXES}&icon_names=${names.join(",")}&display=block`

const cssResponse = await fetch(cssUrl, {
  headers: { "user-agent": USER_AGENT },
})
if (!cssResponse.ok) {
  throw new Error(`GET ${cssUrl} responded ${cssResponse.status}`)
}
const css = await cssResponse.text()
const fontUrl = css.match(/src:\s*url\((https:[^)]+)\)\s*format\('woff2'\)/)?.[1]
if (!fontUrl) {
  throw new Error(`No woff2 URL in css2 response:\n${css}`)
}

const fontResponse = await fetch(fontUrl, {
  headers: { "user-agent": USER_AGENT },
})
if (!fontResponse.ok) {
  throw new Error(`GET ${fontUrl} responded ${fontResponse.status}`)
}
const font = Buffer.from(await fontResponse.arrayBuffer())

mkdirSync(OUTPUT_DIR, { recursive: true })
writeFileSync(OUTPUT_FILE, font)
console.log(
  `Wrote ${OUTPUT_FILE} (${(font.length / 1024).toFixed(1)} kB) with ${names.length} icons:`,
)
console.log(names.join(", "))
