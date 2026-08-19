import { readdirSync, readFileSync, statSync } from "node:fs"
import { join, relative, sep } from "node:path"

// Angular stamps every server-rendered document with ng-server-context; a
// prerendered route page therefore carries it and a plain static asset copied
// from public/ never does. Matching on the attribute is what lets both callers
// below act on exactly the pages the prerenderer produced, instead of assuming
// that every nested index.html is one.
const SERVER_CONTEXT_MARKER = "ng-server-context"

function isPrerendered(file) {
  try {
    return readFileSync(file, "utf8").includes(SERVER_CONTEXT_MARKER)
  } catch {
    return false
  }
}

/**
 * Every prerendered page in a browser build output, as
 * `{ file, route }` — route being the URL path it was rendered for
 * ("/" for the root index.html, "/gn/1" for a nested one).
 *
 * Shared by generate-sitemap.mjs (which turns the routes into <loc> entries)
 * and prune-prerender-for-capacitor.mjs (which deletes the files), so the two
 * can never disagree about what counts as a prerendered page.
 */
export function listPrerenderedPages(webDir) {
  const pages = []

  const walk = (dir) => {
    for (const entry of readdirSync(dir)) {
      const path = join(dir, entry)
      if (statSync(path).isDirectory()) {
        walk(path)
      } else if (entry === "index.html" && isPrerendered(path)) {
        const dirRoute = relative(webDir, dir).split(sep).filter(Boolean)
        pages.push({ file: path, route: `/${dirRoute.join("/")}` })
      }
    }
  }

  walk(webDir)
  return pages
}
