import {
  copyFileSync,
  cpSync,
  existsSync,
  readdirSync,
  rmSync,
} from "node:fs"
import { join } from "node:path"
import { listPrerenderedPages } from "./prerendered-pages.mjs"

// The native app loads the site remotely (capacitor.config.ts server.url) and
// boots the SPA shell locally at best — the ~1300 prerendered route pages are
// dead weight that would add tens of MB to the APK/IPA.
//
// The lean copy is built in its own directory (capacitor.config.ts points
// webDir here) rather than by stripping browserDir in place: browserDir is what
// the web deploy publishes, so pruning it would silently ship a site with no
// prerendered HTML and no error to show for it.
const browserDir = "dist/bible-app/browser"
const webDir = "dist/bible-app/capacitor"

if (!existsSync(browserDir)) {
  // Failing here rather than exiting 0: webDir is this script's own output, so
  // carrying on leaves `npx cap sync` to fail on a missing webDir with no clue
  // that the build is what is missing.
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

// Drop the directories the deleted pages leave behind, deepest first so a
// parent that only held prerendered children goes too.
function pruneEmptyDirs(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) pruneEmptyDirs(join(dir, entry.name))
  }
  if (dir !== webDir && readdirSync(dir).length === 0) {
    rmSync(dir, { recursive: true })
  }
}

pruneEmptyDirs(webDir)

// The root index.html may have been the prerendered home page; the bundled app
// should ship the plain CSR shell instead.
const csrIndex = join(webDir, "index.csr.html")
if (existsSync(csrIndex)) {
  copyFileSync(csrIndex, join(webDir, "index.html"))
}

console.log(
  `Pruned ${prunedRoutes} prerendered route page(s) from ${webDir}; root index.html reset to the CSR shell.`,
)
