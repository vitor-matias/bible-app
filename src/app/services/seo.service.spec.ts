import { DOCUMENT } from "@angular/common"
import { TestBed } from "@angular/core/testing"
import { Meta, Title } from "@angular/platform-browser"
import { BookService } from "./book.service"
import {
  SEO_BASE_URL,
  SEO_DEFAULT_DESCRIPTION,
  SEO_SITE_NAME,
  SeoService,
} from "./seo.service"

describe("SeoService", () => {
  let service: SeoService
  let title: Title
  let meta: Meta
  let doc: Document
  let bookServiceSpy: jasmine.SpyObj<BookService>

  const genesis = {
    id: "GN",
    name: "Génesis",
    shortName: "Génesis",
    abrv: "Gn",
    chapterCount: 50,
  } as Book

  const aboutBook = {
    id: "about",
    name: "Sobre a Bíblia dos Capuchinhos",
    shortName: "Sobre a Bíblia",
    abrv: "Sobre",
    chapterCount: 1,
  } as Book

  function makeChapter(text: string): Chapter {
    return {
      bookId: "GN",
      number: 1,
      verses: [
        {
          bookId: "GN",
          chapterNumber: 1,
          number: 1,
          verseLabel: "1",
          text: [
            { type: "text", text },
            { type: "footnote", text: "nota ignorada", reference: "a" },
            { type: "references", text: "Jo 1,1" },
          ],
        },
      ],
    }
  }

  function getMetaContent(selector: string): string | undefined {
    return meta.getTag(selector)?.getAttribute("content") ?? undefined
  }

  function getCanonicalHref(): string | null | undefined {
    return doc.head.querySelector('link[rel="canonical"]')?.getAttribute("href")
  }

  beforeEach(() => {
    bookServiceSpy = jasmine.createSpyObj("BookService", ["getUrlAbrv"])
    bookServiceSpy.getUrlAbrv.and.returnValue("gn")

    TestBed.configureTestingModule({
      providers: [{ provide: BookService, useValue: bookServiceSpy }],
    })

    service = TestBed.inject(SeoService)
    title = TestBed.inject(Title)
    meta = TestBed.inject(Meta)
    doc = TestBed.inject(DOCUMENT)
  })

  afterEach(() => {
    for (const link of Array.from(
      doc.head.querySelectorAll('link[rel="canonical"]'),
    )) {
      link.remove()
    }
    doc.getElementById("seo-breadcrumbs")?.remove()
    meta.removeTag('name="robots"')
    meta.removeTag('name="description"')
    meta.removeTag('property="og:title"')
    meta.removeTag('property="og:description"')
    meta.removeTag('property="og:url"')
    meta.removeTag('name="twitter:title"')
    meta.removeTag('name="twitter:description"')
  })

  it("should be created", () => {
    expect(service).toBeTruthy()
  })

  describe("updateForChapter", () => {
    it("sets title, canonical URL and og/twitter tags for a chapter", () => {
      service.updateForChapter(genesis, 3)

      expect(title.getTitle()).toBe(`Génesis 3 | ${SEO_SITE_NAME}`)
      expect(getCanonicalHref()).toBe(`${SEO_BASE_URL}/gn/3`)
      expect(getMetaContent('property="og:url"')).toBe(`${SEO_BASE_URL}/gn/3`)
      expect(getMetaContent('property="og:title"')).toBe(
        `Génesis 3 | ${SEO_SITE_NAME}`,
      )
      expect(getMetaContent('name="twitter:title"')).toBe(
        `Génesis 3 | ${SEO_SITE_NAME}`,
      )
      expect(bookServiceSpy.getUrlAbrv).toHaveBeenCalledWith(genesis)
    })

    it("builds the description from verse text, skipping footnotes and references", () => {
      service.updateForChapter(
        genesis,
        1,
        makeChapter("No princípio, Deus criou o céu e a terra."),
      )

      const description = getMetaContent('name="description"')
      expect(description).toBe(
        "Génesis 1: No princípio, Deus criou o céu e a terra.",
      )
      expect(description).not.toContain("nota ignorada")
      expect(description).not.toContain("Jo 1,1")
      expect(getMetaContent('property="og:description"')).toBe(description)
    })

    it("truncates long descriptions at a word boundary with an ellipsis", () => {
      const longText = "palavra ".repeat(60)
      service.updateForChapter(genesis, 1, makeChapter(longText))

      const description = getMetaContent('name="description"') ?? ""
      expect(description.length).toBeLessThanOrEqual(159)
      expect(description.endsWith("…")).toBeTrue()
      expect(description).not.toContain("  ")
    })

    it("falls back to a generic description when the chapter has no verses", () => {
      service.updateForChapter(genesis, 2)

      const description = getMetaContent('name="description"') ?? ""
      expect(description).toContain("Génesis")
      expect(description).toContain("2")
    })

    it("removes a previously set robots noindex tag", () => {
      service.updateForSearch()
      expect(getMetaContent('name="robots"')).toBe("noindex, follow")

      service.updateForChapter(genesis, 1)
      expect(meta.getTag('name="robots"')).toBeNull()
    })

    it("updates the existing canonical link instead of adding a second one", () => {
      service.updateForChapter(genesis, 1)
      service.updateForChapter(genesis, 2)

      expect(doc.head.querySelectorAll('link[rel="canonical"]').length).toBe(1)
      expect(getCanonicalHref()).toBe(`${SEO_BASE_URL}/gn/2`)
    })

    // Spelled out rather than interpolated: every other expectation here builds
    // its string from SEO_SITE_NAME, so they would all still pass if the site
    // name were changed by accident.
    it("names the site 'Bíblia Sagrada' in page titles", () => {
      service.updateForChapter(aboutBook, 1)

      expect(title.getTitle()).toBe("Bíblia Sagrada")
    })

    it("uses the site defaults for the about page", () => {
      service.updateForChapter(aboutBook, 1)

      expect(title.getTitle()).toBe(SEO_SITE_NAME)
      expect(getMetaContent('name="description"')).toBe(SEO_DEFAULT_DESCRIPTION)
      expect(getCanonicalHref()).toBe(`${SEO_BASE_URL}/`)
    })
  })

  describe("breadcrumb JSON-LD", () => {
    function getBreadcrumbs(): {
      itemListElement: { position: number; name: string; item: string }[]
    } | null {
      const script = doc.getElementById("seo-breadcrumbs")
      return script?.textContent ? JSON.parse(script.textContent) : null
    }

    it("injects a Home → Book → Chapter BreadcrumbList for a chapter", () => {
      service.updateForChapter(genesis, 3)

      const breadcrumbs = getBreadcrumbs()
      expect(breadcrumbs).not.toBeNull()
      expect(breadcrumbs?.itemListElement.length).toBe(3)
      expect(breadcrumbs?.itemListElement[0].name).toBe(SEO_SITE_NAME)
      expect(breadcrumbs?.itemListElement[0].item).toBe(`${SEO_BASE_URL}/`)
      expect(breadcrumbs?.itemListElement[1].name).toBe("Génesis")
      expect(breadcrumbs?.itemListElement[1].item).toBe(`${SEO_BASE_URL}/gn/1`)
      expect(breadcrumbs?.itemListElement[2].name).toBe("Génesis 3")
      expect(breadcrumbs?.itemListElement[2].item).toBe(`${SEO_BASE_URL}/gn/3`)
      expect(breadcrumbs?.itemListElement[2].position).toBe(3)
    })

    it("replaces the breadcrumb script on navigation instead of stacking", () => {
      service.updateForChapter(genesis, 1)
      service.updateForChapter(genesis, 2)

      expect(doc.querySelectorAll("#seo-breadcrumbs").length).toBe(1)
      expect(getBreadcrumbs()?.itemListElement[2].item).toBe(
        `${SEO_BASE_URL}/gn/2`,
      )
    })

    it("removes the breadcrumb script on search and about pages", () => {
      service.updateForChapter(genesis, 1)
      service.updateForSearch()
      expect(doc.getElementById("seo-breadcrumbs")).toBeNull()

      service.updateForChapter(genesis, 1)
      service.updateForChapter(aboutBook, 1)
      expect(doc.getElementById("seo-breadcrumbs")).toBeNull()
    })
  })

  describe("updateForSearch", () => {
    it("sets a noindex robots tag and the search canonical URL", () => {
      service.updateForSearch()

      expect(title.getTitle()).toBe(`Pesquisar | ${SEO_SITE_NAME}`)
      expect(getMetaContent('name="robots"')).toBe("noindex, follow")
      expect(getCanonicalHref()).toBe(`${SEO_BASE_URL}/search`)
    })
  })
})
