import {
  copyFileSync,
  cpSync,
  existsSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { join } from "node:path"
import { listPrerenderedPages } from "./prerendered-pages.mjs"

// The native app never uses the prerendered route pages, which would add tens
// of MB to the APK/IPA. Prune a copy (capacitor.config.ts webDir), never
// browserDir itself: that is what the web deploy publishes.
const browserDir = "dist/bible-app/browser"
const webDir = "dist/bible-app/capacitor"

if (!existsSync(browserDir)) {
  // Fail loudly, or `npx cap sync` fails later on a missing webDir.
  console.error(
    `Cannot prune: ${browserDir} does not exist. Run "npm run build" first.`,
  )
  process.exit(1)
}

rmSync(webDir, { recursive: true, force: true })
cpSync(browserDir, webDir, { recursive: true })

let prunedRoutes = 0
for (const page of listPrerenderedPages(webDir)) {
  rmSync(page.file)
  prunedRoutes++
}

// Deepest first, so a parent left holding only empty directories goes too.
function pruneEmptyDirs(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) pruneEmptyDirs(join(dir, entry.name))
  }
  if (dir !== webDir && readdirSync(dir).length === 0) {
    rmSync(dir, { recursive: true })
  }
}

pruneEmptyDirs(webDir)

// The root index.html may be the prerendered home page; ship the CSR shell.
const csrIndex = join(webDir, "index.csr.html")
if (existsSync(csrIndex)) {
  copyFileSync(csrIndex, join(webDir, "index.html"))
}

function listFiles(dir, pattern) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return listFiles(path, pattern)
    return pattern.test(entry.name) ? [path] : []
  })
}

// src/index.html fences website-only tags (the Google Ads tag) between
// web-only markers; the native apps must not load them.
const webOnlyBlock = /[ \t]*<!-- web-only:start -->[\s\S]*?<!-- web-only:end -->\n?/g
for (const file of listFiles(webDir, /\.html$/)) {
  writeFileSync(file, readFileSync(file, "utf8").replace(webOnlyBlock, ""))
}

// Fail the build rather than ship an app that loads the ad tag, e.g. if the
// markers were removed or the tag moved into code.
const forbidden = "googletagmanager"
const leaks = listFiles(webDir, /\.(html|js|mjs)$/).filter((file) =>
  readFileSync(file, "utf8").includes(forbidden),
)
if (leaks.length > 0) {
  console.error(
    `The native bundle still references ${forbidden}:\n  ${leaks.join("\n  ")}\n` +
      "Keep website-only tags between <!-- web-only:start --> and <!-- web-only:end --> in src/index.html.",
  )
  process.exit(1)
}

console.log(
  `Pruned ${prunedRoutes} prerendered route page(s) from ${webDir}; root index.html reset to the CSR shell, website-only tags removed.`,
)
