import { copyFileSync, existsSync } from "node:fs"

// With prerendering (outputMode "static"), the client-rendered fallback is
// emitted as index.csr.html. Today "/" is prerendered, so index.html already
// exists and this is a no-op — it is the safety net for a build that stops
// prerendering "/", where hosts serving index.html as the SPA fallback would
// otherwise 404.
//
// index.html must stay the prerendered home page, so it is NOT the SPA
// fallback: client-rendered routes ("/search", unknown URLs) are rewritten to
// index.csr.html by vercel.json. Serving them the prerendered home instead
// would answer them with home-page content, canonical and title, and without
// the noindex SeoService only adds once the bundle has booted.
const source = "dist/bible-app/browser/index.csr.html"
const target = "dist/bible-app/browser/index.html"

if (existsSync(source) && !existsSync(target)) {
  copyFileSync(source, target)
  console.log(`Copied ${source} -> ${target}`)
} else {
  console.log("CSR index copy not needed.")
}
