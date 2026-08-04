import { DOCUMENT } from "@angular/common"
import { Injectable, inject } from "@angular/core"
import { Meta, Title } from "@angular/platform-browser"
import { appConfig } from "../config"
import { BookService } from "./book.service"

export const SEO_SITE_NAME = "Bíblia dos Capuchinhos"
export const SEO_BASE_URL = `https://${appConfig.domain}`
export const SEO_DEFAULT_DESCRIPTION =
  "A Bíblia Sagrada completa em português, da Difusora Bíblica (Franciscanos Capuchinhos). " +
  "Leitura online e offline, gratuita, com pesquisa e marcadores."

/** Google truncates snippets around this length, so excerpts stop here. */
const MAX_DESCRIPTION_LENGTH = 158

@Injectable({
  providedIn: "root",
})
export class SeoService {
  private title = inject(Title)
  private meta = inject(Meta)
  private document = inject(DOCUMENT)
  private bookService = inject(BookService)

  /**
   * Reflect the currently displayed chapter in the document head so each
   * book/chapter URL gets its own title, description and canonical URL.
   */
  updateForChapter(
    book: Book,
    chapterNumber: Chapter["number"],
    chapter?: Chapter,
  ): void {
    if (book.id === "about") {
      this.updateForAbout()
      return
    }

    this.apply({
      title: `${book.shortName} ${chapterNumber} | ${SEO_SITE_NAME}`,
      description: this.buildChapterDescription(book, chapterNumber, chapter),
      canonicalUrl: `${SEO_BASE_URL}/${this.bookService.getUrlAbrv(book)}/${chapterNumber}`,
      indexable: true,
    })
  }

  updateForAbout(): void {
    this.apply({
      title: SEO_SITE_NAME,
      description: SEO_DEFAULT_DESCRIPTION,
      canonicalUrl: `${SEO_BASE_URL}/`,
      indexable: true,
    })
  }

  /** Search results are user-specific, so keep them out of the index. */
  updateForSearch(): void {
    this.apply({
      title: `Pesquisar | ${SEO_SITE_NAME}`,
      description: `Pesquise passagens, versículos e palavras na ${SEO_SITE_NAME}.`,
      canonicalUrl: `${SEO_BASE_URL}/search`,
      indexable: false,
    })
  }

  private apply(page: {
    title: string
    description: string
    canonicalUrl: string
    indexable: boolean
  }): void {
    this.title.setTitle(page.title)
    this.meta.updateTag({ name: "description", content: page.description })
    this.meta.updateTag({ property: "og:title", content: page.title })
    this.meta.updateTag({
      property: "og:description",
      content: page.description,
    })
    this.meta.updateTag({ property: "og:url", content: page.canonicalUrl })
    this.meta.updateTag({ name: "twitter:title", content: page.title })
    this.meta.updateTag({
      name: "twitter:description",
      content: page.description,
    })

    if (page.indexable) {
      this.meta.removeTag('name="robots"')
    } else {
      this.meta.updateTag({ name: "robots", content: "noindex, follow" })
    }

    this.setCanonicalUrl(page.canonicalUrl)
  }

  private setCanonicalUrl(url: string): void {
    let link = this.document.head.querySelector<HTMLLinkElement>(
      'link[rel="canonical"]',
    )
    if (!link) {
      link = this.document.createElement("link")
      link.setAttribute("rel", "canonical")
      this.document.head.appendChild(link)
    }
    link.setAttribute("href", url)
  }

  private buildChapterDescription(
    book: Book,
    chapterNumber: Chapter["number"],
    chapter?: Chapter,
  ): string {
    const excerpt = this.buildExcerpt(chapter)
    if (!excerpt) {
      return this.truncate(
        `Leia ${book.shortName}, capítulo ${chapterNumber}, na ${SEO_SITE_NAME}. ${SEO_DEFAULT_DESCRIPTION}`,
      )
    }
    return this.truncate(`${book.shortName} ${chapterNumber}: ${excerpt}`)
  }

  private buildExcerpt(chapter?: Chapter): string {
    if (!chapter?.verses?.length) return ""

    const parts: string[] = []
    let length = 0
    for (const verse of chapter.verses) {
      for (const segment of verse.text ?? []) {
        if (
          segment.type === "text" ||
          segment.type === "quote" ||
          segment.type === "paragraph"
        ) {
          parts.push(segment.text)
          length += segment.text.length
        }
      }
      if (length >= MAX_DESCRIPTION_LENGTH) break
    }
    return parts.join(" ").replace(/\s+/g, " ").trim()
  }

  private truncate(value: string): string {
    if (value.length <= MAX_DESCRIPTION_LENGTH) return value
    const cut = value.slice(0, MAX_DESCRIPTION_LENGTH)
    const lastSpace = cut.lastIndexOf(" ")
    return `${cut.slice(0, lastSpace > 0 ? lastSpace : MAX_DESCRIPTION_LENGTH).trimEnd()}…`
  }
}
