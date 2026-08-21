import { readFileSync, readdirSync, statSync } from "node:fs"
import { join, relative, sep } from "node:path"

// Angular stamps every server-rendered document with ng-server-context; a
// prerendered route page therefore carries it and a plain static asset copied
// from public/ never does. Matching on the attribute is what lets both callers
// below act on exactly the pages the prerenderer produced, instead of assuming
// that every nested index.html is one.
const SERVER_CONTEXT_MARKER = "ng-server-context"

// Angular stamps the attribute on <app-root>, not on <html>: it sits after the
// whole <head>, which a production build fills with inlined critical CSS —
// ~79KB into the page. Reading a fixed opening window therefore answered "not
// prerendered" for every page, which silently emptied the sitemap and left the
// Capacitor prune with nothing to do. Scan the file as bytes instead: Buffer
// search never decodes it to a string, which is what the opening window was
// really there to avoid.
function isPrerendered(file) {
  try {
    return readFileSync(file).includes(SERVER_CONTEXT_MARKER)
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
