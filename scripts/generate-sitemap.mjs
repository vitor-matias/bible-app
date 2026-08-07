import { existsSync, writeFileSync } from "node:fs"
import { join } from "node:path"

// Mirrors appConfig.domain in src/app/config.ts and the /v1 API the app uses.
const BASE_URL = "https://biblia.capuchinhos.org"
const BOOKS_ENDPOINT = `${BASE_URL}/v1/books`
const FETCH_TIMEOUT_MS = 20_000
// Psalms (150) is the largest real book; anything beyond this is bad data
// that would otherwise balloon the sitemap.
const MAX_CHAPTERS_PER_BOOK = 200
// The canon is 73 books. Without a cap here the per-book limit still leaves the
// total unbounded, so a response with enough book records could balloon the
// sitemap instead of being rejected as the bad data it is.
const MAX_BOOKS = 200

// Same rule as BookService.getUrlAbrv: abbreviation without spaces, lowercased.
function urlAbrv(book) {
  return book.abrv.replace(/\s/g, "").toLowerCase()
}

function xmlEscape(value) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
}

function buildSitemap(books) {
  const urls = [`${BASE_URL}/`]
  for (const book of books) {
    const abrv = urlAbrv(book)
    for (let chapter = 1; chapter <= book.chapterCount; chapter++) {
      urls.push(`${BASE_URL}/${abrv}/${chapter}`)
    }
  }

  const entries = urls
    .map((url) => `  <url><loc>${xmlEscape(url)}</loc></url>`)
    .join("\n")

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries}
</urlset>
`
}

async function fetchBooks() {
  const response = await fetch(BOOKS_ENDPOINT, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    headers: { accept: "application/json" },
  })
  if (!response.ok) {
    throw new Error(`GET ${BOOKS_ENDPOINT} responded ${response.status}`)
  }
  const books = await response.json()
  if (!Array.isArray(books) || books.length === 0) {
    throw new Error(`GET ${BOOKS_ENDPOINT} returned no books`)
  }
  if (books.length > MAX_BOOKS) {
    throw new Error(
      `GET ${BOOKS_ENDPOINT} returned ${books.length} books (max ${MAX_BOOKS})`,
    )
  }
  const validBooks = books.filter(
    (book) =>
      typeof book?.abrv === "string" &&
      book.abrv.trim().length > 0 &&
      Number.isInteger(book?.chapterCount) &&
      book.chapterCount > 0 &&
      book.chapterCount <= MAX_CHAPTERS_PER_BOOK,
  )
  if (validBooks.length === 0) {
    // Never overwrite a good sitemap with a home-page-only one.
    throw new Error(`GET ${BOOKS_ENDPOINT} returned no valid books`)
  }
  return validBooks
}

// Prefer the production build output (build:post); fall back to public/ when
// run standalone so the file ships with the next build.
const distPath = "dist/bible-app/browser"
const outputDir = existsSync(distPath) ? distPath : "public"
const outputFile = join(outputDir, "sitemap.xml")

try {
  const books = await fetchBooks()
  writeFileSync(outputFile, buildSitemap(books), "utf8")
  const chapterCount = books.reduce((sum, book) => sum + book.chapterCount, 0)
  console.log(
    `Sitemap written to ${outputFile}: ${books.length} books, ${chapterCount + 1} URLs`,
  )
} catch (error) {
  // Builds must keep working without network access; the previous sitemap
  // (if any) simply stays in place.
  console.warn(`Skipped sitemap generation: ${error.message ?? error}`)
}
