import { closeSync, openSync, readdirSync, readSync, statSync } from "node:fs"
import { join, relative, sep } from "node:path"

// Angular stamps every server-rendered document with ng-server-context; a
// prerendered route page therefore carries it and a plain static asset copied
// from public/ never does. Matching on the attribute is what lets both callers
// below act on exactly the pages the prerenderer produced, instead of assuming
// that every nested index.html is one.
const SERVER_CONTEXT_MARKER = "ng-server-context"

// The marker is an attribute on <html>, so only the opening bytes decide it.
// Whole pages run ~166KB and there are ~1300 of them, which is ~215MB to
// decode per pass — twice per release, once here and once for the Capacitor
// prune — for an answer that is settled in the first line.
const HEAD_BYTES = 4096

function isPrerendered(file) {
  let descriptor
  try {
    descriptor = openSync(file, "r")
    const head = Buffer.alloc(HEAD_BYTES)
    const read = readSync(descriptor, head, 0, HEAD_BYTES, 0)
    return head.subarray(0, read).includes(SERVER_CONTEXT_MARKER)
  } catch {
    return false
  } finally {
    if (descriptor !== undefined) closeSync(descriptor)
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
