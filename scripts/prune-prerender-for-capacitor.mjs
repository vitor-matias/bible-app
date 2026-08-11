import { copyFileSync, existsSync, readdirSync, rmSync, statSync } from "node:fs"
import { join } from "node:path"

// The native app loads the site remotely (capacitor.config.ts server.url) and
// boots the SPA shell locally at best — the ~1300 prerendered route pages are
// dead weight that would add tens of MB to the APK/IPA. Strip them from the
// webDir before `cap sync` so the bundled copy is always the lean CSR build.
const webDir = "dist/bible-app/browser"

if (!existsSync(webDir)) {
  console.log(`Nothing to prune: ${webDir} does not exist.`)
  process.exit(0)
}

let prunedRoutes = 0

function pruneDir(dir) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) {
      pruneDir(path)
      if (readdirSync(path).length === 0) {
        rmSync(path, { recursive: true })
      }
    } else if (entry === "index.html" && dir !== webDir) {
      // Only prerendered routes produce nested index.html files; static
      // assets from public/ never do.
      rmSync(path)
      prunedRoutes++
    }
  }
}

pruneDir(webDir)

// The root index.html may be the prerendered home page; the bundled app
// should ship the plain CSR shell instead.
const csrIndex = join(webDir, "index.csr.html")
if (existsSync(csrIndex)) {
  copyFileSync(csrIndex, join(webDir, "index.html"))
}

console.log(
  `Pruned ${prunedRoutes} prerendered route page(s); root index.html reset to the CSR shell.`,
)
