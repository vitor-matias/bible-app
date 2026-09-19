import { readFileSync, readdirSync, statSync } from "node:fs"
import { join, relative, sep } from "node:path"

// Angular stamps server-rendered documents with this attribute; static
// index.html files copied from public/ never carry it.
const SERVER_CONTEXT_MARKER = "ng-server-context"

// The attribute sits on <app-root>, after a <head> that inlined critical CSS
// can make tens of KB long, so scan the whole file.
function isPrerendered(file) {
  try {
    return readFileSync(file).includes(SERVER_CONTEXT_MARKER)
  } catch {
    return false
  }
}

/**
 * Every prerendered page under webDir as `{ file, route }` ("/" for the root
 * index.html, "/gn/1" for a nested one). Shared by the sitemap and prune scripts.
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
