// Turns the Índice Bíblico-Pastoral's TEI file into the JSON the app ships:
//   node scripts/build-pastoral-index.mjs <path>/Index/poribp.xml
//
// Only the text is taken. The file's osisRefs are unreliable (bare chapters
// often point at 1-2 Kings) and many citations have none; the app links
// citations from the text itself, with BibleReferenceService.
import { readFileSync, writeFileSync } from "node:fs"

const OUTPUT = "src/app/components/pastoral-index/pastoral-index.data.json"
// Apart from the text, for the ribbons in the main bundle to name their themes.
const TITLES = "src/app/pastoral-index-titles.json"

/** Errors in the source's text, which the translation repo should fix too. */
const TEXT_FIXES = [
  // Line-break hyphens the conversion kept: "regressa- dos".
  [/(\p{Ll})- (?=\p{Ll})/gu, "$1"],
  // Scanning errors: a letter l for the number of the book.
  [/\bl (?=(?:Pe|Ts|Sm) \d)/g, "1 "],
  // "Ez 36, 24-28" is a chapter and a verse; spaced, it reads as a chapter alone.
  [/(\d), (?=\d)/g, "$1,"],
  // Typos that send a citation to the wrong book or chapter.
  ["Jeremias: 1,4-19", "Jeremias: Jr 1,4-19"],
  ["G1 4,4", "Gl 4,4"],
  ["Gl 3,l-9", "Gl 3,1-9"],
  // A verse list broken by a space: "(n). 11 (n)". Not "(n). 2 Cor", a new book.
  [/\(n\)\. (?=\d(?! \p{Lu}))/gu, "(n)."],
  // Doubled punctuation: "e par..", "a.C..", "Retribuição.:".
  [/(?<!\.)\.\.(?!\.)/g, "."],
  [/\.:/g, "."],
  // Not references, though a parser reads "os 7" as Oseias 7.
  ["os 7 chifres", "os sete chifres"],
  ["o 4.° Evangelho", "o quarto Evangelho"],
  // The chapter is missing: the farewell of Matatias.
  ["1 Mac 49-68", "1 Mac 2,49-68"],
]

/** Where an Old Testament theme's "Sacerdócio" isn't the Christian one. */
const SEE_ALIASES_IN = {
  aarao: { sacerdocio: "sacerdote" },
  sacrificios: { sacerdocio: "sacerdote" },
}

/** Entries whose hyphens are real; the source turned every other space into one. */
const REAL_HYPHENS = /^(bem-aventuranças|dêutero-canónicos|proto-canónicos|pseudo-epígrafos|sábado-domingo)$/i

/** Cross-references naming an entry by another of its words. */
const SEE_ALIASES = {
  "ano sabatico": "ano sabatico e jubilar",
  paz: "paz messianica",
  "bom pastor": "pastor",
  "cordeiro pascal": "cordeiro",
  crisma: "confirmacao",
  "descida aos infernos": "descida de cristo aos infernos",
  "doutor da lei": "doutor da lei (escriba)",
  "espirito santo": "espirito de deus",
  "festa da pascoa": "pascoa",
  "festa das tendas": "tendas",
  "festas das tendas": "tendas",
  "nomes de deus": "nome",
  obediencia: "obediencia as autoridades",
  palavra: "palavra de deus",
  "reino de deus": "reinado de deus",
  sabado: "sabado domingo",
  sacerdocio: "sacerdocio cristao",
  "servo de jave": "servo",
  "urim e tumim": "urim tumim",
}

const stripAccents = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "")
const lookupKey = (s) =>
  stripAccents(s).toLowerCase().replace(/-/g, " ").replace(/[.,:]+$/, "").trim()
const slugify = (s) =>
  stripAccents(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
const decode = (s) =>
  s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
const fixText = (s) =>
  TEXT_FIXES.reduce((text, [from, to]) => text.replaceAll(from, to), s)

function titleOf(sortKey) {
  const key = sortKey.replace(/[.:]+$/, "")
  if (key === "bediência-às-autoridades") return "Obediência às autoridades"
  if (key === "Vem-Senhor") return "Vem, Senhor"
  return REAL_HYPHENS.test(key) ? key : key.replace(/-/g, " ")
}

/** Walks one entry into paragraphs of text and `{ text, target }` cross-references. */
function parseEntry(xml) {
  const paragraphs = [[]]
  let refTarget = null
  let refText = ""
  for (const [token] of xml.matchAll(/<[^>]+>|[^<]+/g)) {
    if (!token.startsWith("<")) {
      if (refTarget !== null) refText += decode(token)
      else paragraphs.at(-1).push(decode(token))
    } else if (token.startsWith("<ref ") && token.includes("target=")) {
      refTarget = /target="([^"]*)"/.exec(token)[1]
      refText = ""
    } else if (token === "</ref>" && refTarget !== null) {
      paragraphs.at(-1).push({ text: refText, target: refTarget })
      refTarget = null
    } else if (token.startsWith("<item")) {
      paragraphs.push(["➢ "])
    } else if (/^<(lb|\/list)\b/.test(token)) {
      paragraphs.push([])
    }
  }
  return paragraphs
}

/** A cross-reference may name several entries ("Apóstolos, Carisma, Igreja"). */
function linkSee(ref, slugs, self, unresolved) {
  // The source has a few broken labels: ", " for Idolatria, "TerraTerra".
  let label = /\p{L}/u.test(ref.text) ? ref.text.trim() : ref.target
  if (label === ref.target + ref.target) label = ref.target
  const slugOf = (name) => {
    const key = lookupKey(name)
    return slugs.get(SEE_ALIASES_IN[self]?.[key] ?? SEE_ALIASES[key] ?? key)
  }
  // Whole first: "Ano Sabático e Jubilar" is one entry.
  const pieces = slugOf(label) ? [label] : label.split(/(, | e )/)
  return pieces.flatMap((piece, i) => {
    if (i % 2) return [piece]
    // A comma after the name is no part of the link: "Servo de Javé, ".
    const [, name, comma] = /^(.*?)(,?)$/.exec(piece)
    const slug = slugOf(name)
    if (!slug) unresolved.add(name)
    return slug && slug !== self ? [{ text: name, slug }, comma] : [piece]
  })
}

function tidy(parts) {
  const merged = []
  for (const part of parts) {
    if (typeof part === "string" && typeof merged.at(-1) === "string") {
      merged[merged.length - 1] += part
    } else {
      merged.push(part)
    }
  }
  const out = merged.map((part) =>
    typeof part === "string" ? fixText(part.replace(/\s+/g, " ")) : part,
  )
  // Some entries open with a stray full stop: ".  Ver Vem, Senhor".
  if (typeof out[0] === "string") out[0] = out[0].replace(/^[\s.,;:]+/, "")
  if (typeof out.at(-1) === "string") out[out.length - 1] = out.at(-1).trimEnd()
  return out.filter((part) => part !== "")
}

/** Errors in the source's markup. */
const fixMarkup = (xml) =>
  xml
    // A name tagged as two links, each then leading to the wrong entry.
    .replace(
      '<ref target="Vem">Vem</ref>, <ref target="Senhor">Senhor</ref>',
      '<ref target="Vem, Senhor">Vem, Senhor</ref>',
    )
    // Markup leaked into the text, with the link twice.
    .replace(
      '</ref>"&gt; <ref target="Bíblia e Palavra de Deus">Bíblia e Palavra de Deus</ref>',
      "</ref>",
    )
    // The entry Paz lost its own entry tag, and sits inside Paulo.
    .replace(
      "Flm. Paz messiânica Paz (shalom)",
      'Flm.</item></list></def></entryFree><entryFree sortKey="Paz-messiânica"><def>Paz (shalom)',
    )

/** "ver Matrimónio" in the running text, which the source leaves untagged. */
function linkPlainSee(text, slugs, self, unresolved) {
  return text
    .split(/(\b[Vv]er [^.;:()]+)/)
    .flatMap((piece, i) => {
      if (i % 2 === 0) return [piece]
      const name = piece.slice(4)
      return [
        piece.slice(0, 4),
        ...linkSee({ text: name, target: name }, slugs, self, unresolved),
      ]
    })
}

const source = fixMarkup(readFileSync(process.argv[2], "utf8"))
const raw = [...source.matchAll(/<entryFree sortKey="([^"]+)">(.*?)<\/entryFree>/gs)]
  .map(([, sortKey, body]) => ({ title: titleOf(sortKey), body }))

const slugs = new Map()
for (const { title } of raw) {
  const slug = slugify(title)
  for (const name of [title, ...title.split("/")]) {
    const key = lookupKey(name)
    slugs.set(key, slug)
    if (key.endsWith("s")) slugs.set(key.slice(0, -1), slugs.get(key.slice(0, -1)) ?? slug)
    else slugs.set(`${key}s`, slugs.get(`${key}s`) ?? slug)
  }
}

const unresolved = new Set()
const entries = raw
  .map(({ title, body }) => {
    const slug = slugify(title)
    const paragraphs = parseEntry(body)
      .map((parts) =>
        tidy(
          parts.flatMap((part) =>
            typeof part === "string"
              ? linkPlainSee(part, slugs, slug, unresolved)
              : linkSee(part, slugs, slug, unresolved),
          ),
        ),
      )
      .filter((parts) => parts.length && parts.join("").trim() !== "➢")
    return { slug, title, paragraphs }
  })
  .sort((a, b) => a.title.localeCompare(b.title, "pt"))

const seen = new Set()
for (const { slug } of entries) {
  if (seen.has(slug)) throw new Error(`Two entries share the slug ${slug}`)
  seen.add(slug)
}

writeFileSync(OUTPUT, `${JSON.stringify(entries)}\n`)
writeFileSync(
  TITLES,
  `${JSON.stringify(Object.fromEntries(entries.map(({ slug, title }) => [slug, title])))}\n`,
)
console.log(`${entries.length} entries; cross-references left as text:`)
console.log([...unresolved].sort().join(" | "))
