import {
  copyFileSync,
  cpSync,
  existsSync,
  readdirSync,
  rmSync,
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

console.log(
  `Pruned ${prunedRoutes} prerendered route page(s) from ${webDir}; root index.html reset to the CSR shell.`,
)
