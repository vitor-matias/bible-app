// Fails the build when an inline script in the built pages is missing from the
// Content-Security-Policy in vercel.json, or when docs/security-headers.md (the
// nginx copy production uses) no longer carries the same policy. Browsers would
// silently refuse the script, e.g. the theme script that prevents a white flash.
import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"

const vercel = JSON.parse(readFileSync("vercel.json", "utf8"))
const csp = vercel.headers
  .flatMap((rule) => rule.headers)
  .find((header) => header.key === "Content-Security-Policy").value
const problems = []

for (const page of ["index.csr.html", "index.html"]) {
  const html = readFileSync(`dist/bible-app/browser/${page}`, "utf8")
  // Data blocks (JSON, JSON-LD) are never executed, so CSP ignores them.
  const inline = /<script(?![^>]*\b(?:src=|type="application\/(?:ld\+)?json"))[^>]*>([\s\S]*?)<\/script>/g
  for (const [, body] of html.matchAll(inline)) {
    const hash = `'sha256-${createHash("sha256").update(body).digest("base64")}'`
    if (!csp.includes(hash)) problems.push(`${page}: inline script ${hash} is not in vercel.json's CSP`)
  }
}

const doc = readFileSync("docs/security-headers.md", "utf8")
// The nginx lines are what the owner copies, so each one must match exactly.
const nginx = [
  ...doc.matchAll(/add_header Content-Security-Policy(?:-Report-Only)? "([^"]*)"/g),
].map((match) => match[1])
if (!nginx.length) problems.push("docs/security-headers.md has no nginx CSP add_header line")
for (const value of nginx) {
  if (value !== csp) problems.push(`docs/security-headers.md: nginx CSP differs from vercel.json's: ${value}`)
}
if (!doc.replace(/add_header Content-Security-Policy.*/g, "").includes(csp)) {
  problems.push("docs/security-headers.md: the policy overview differs from vercel.json's CSP")
}

if (problems.length) {
  console.error(problems.join("\n"))
  process.exit(1)
}
console.log("CSP check: inline scripts hashed, nginx doc in sync")
