import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { listPrerenderedPages } from "./prerendered-pages.mjs"

// Read from src/app/config.ts rather than restated here, so the app's
// canonical URLs and the sitemap can never name different hosts.
const configSource = readFileSync("src/app/config.ts", "utf8")
const domain = /domain:\s*"([^"]+)"/.exec(configSource)?.[1]
if (!domain) {
  throw new Error("Could not read appConfig.domain from src/app/config.ts")
}
const BASE_URL = `https://${domain}`

// The sitemap lists what the build actually produced rather than re-deriving
// it from the API: prerender-params.ts has already fetched the book list,
// applied its bounds and expanded the routes, so reading the output back keeps
// the sitemap in step with the prerendered pages instead of duplicating that
// logic here — and honours PRERENDER_API_ORIGIN for free.
const browserDir = "dist/bible-app/browser"
const outputFile = join(browserDir, "sitemap.xml")

function xmlEscape(value) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
}

function buildSitemap(routes) {
  const entries = routes
    .map((route) => `  <url><loc>${xmlEscape(`${BASE_URL}${route}`)}</loc></url>`)
    .join("\n")

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries}
</urlset>
`
}

if (!existsSync(browserDir)) {
  // Only ever written into the build output. Writing into public/ instead
  // would replace the deliberately minimal fallback sitemap that is checked
  // in so robots.txt never points at a 404.
  console.warn(
    `Skipped sitemap generation: ${browserDir} does not exist. Run "npm run build" first.`,
  )
} else {
  const routes = listPrerenderedPages(browserDir)
    .map((page) => page.route)
    .sort()

  if (routes.length === 0) {
    // A build without API access prerenders nothing; leave the checked-in
    // fallback sitemap that Angular copied from public/ in place.
    console.warn(
      "Skipped sitemap generation: the build contains no prerendered pages.",
    )
  } else {
    writeFileSync(outputFile, buildSitemap(routes), "utf8")
    console.log(`Sitemap written to ${outputFile}: ${routes.length} URLs`)
  }
}
