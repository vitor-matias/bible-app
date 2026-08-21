import { copyFileSync, existsSync } from "node:fs"

// With prerendering (outputMode "static"), the client-rendered fallback is
// emitted as index.csr.html. Hosts configured to serve index.html as the SPA
// fallback would 404 without it, so keep both names pointing at the same file.
const source = "dist/bible-app/browser/index.csr.html"
const target = "dist/bible-app/browser/index.html"

if (existsSync(source) && !existsSync(target)) {
  copyFileSync(source, target)
  console.log(`Copied ${source} -> ${target}`)
} else {
  console.log("CSR index copy not needed.")
}
