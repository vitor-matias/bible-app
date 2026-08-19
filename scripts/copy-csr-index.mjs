import { copyFileSync, existsSync } from "node:fs"

// With prerendering (outputMode "static"), the client-rendered fallback is
// emitted as index.csr.html. Today "/" is prerendered, so index.html already
// exists and this is a no-op — it is the safety net for a build that stops
// prerendering "/", where hosts serving index.html as the SPA fallback would
// otherwise 404.
const source = "dist/bible-app/browser/index.csr.html"
const target = "dist/bible-app/browser/index.html"

if (existsSync(source) && !existsSync(target)) {
  copyFileSync(source, target)
  console.log(`Copied ${source} -> ${target}`)
} else {
  console.log("CSR index copy not needed.")
}
