// Serves the production build the way nginx does: a route's prerendered page,
// else the client-rendered shell, with /v1 from the public API.
import { createServer } from "node:http"
import { existsSync, readFileSync, statSync } from "node:fs"
import { extname, join } from "node:path"

const ROOT = "dist/bible-app/browser"
const TYPES = {
  ".css": "text/css",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
}

createServer(async (request, response) => {
  const { pathname, search } = new URL(request.url, "http://localhost")
  if (pathname.startsWith("/v1/")) {
    const api = await fetch(`https://biblia.capuchinhos.org${pathname}${search}`)
    response.writeHead(api.status, { "content-type": "application/json" })
    response.end(Buffer.from(await api.arrayBuffer()))
    return
  }
  let file = join(ROOT, decodeURIComponent(pathname))
  if (existsSync(file) && statSync(file).isDirectory()) {
    file = join(file, "index.html")
  }
  if (!existsSync(file)) file = join(ROOT, "index.csr.html")
  response.writeHead(200, { "content-type": TYPES[extname(file)] ?? "" })
  response.end(readFileSync(file))
}).listen(4201)
