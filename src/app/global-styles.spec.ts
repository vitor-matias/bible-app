import { Component } from "@angular/core"
import { TestBed } from "@angular/core/testing"
import { MatSnackBar } from "@angular/material/snack-bar"
import { provideNoopAnimations } from "@angular/platform-browser/animations"

// Rules in src/styles.css that reach across components.
describe("global styles", () => {
  @Component({ template: "" })
  class HostComponent {}

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HostComponent],
      providers: [provideNoopAnimations()],
    })
    document.documentElement.style.setProperty("--app-inset-bottom", "100px")
  })

  afterEach(() => {
    TestBed.inject(MatSnackBar).dismiss()
    document.documentElement.style.removeProperty("--app-inset-bottom")
  })

  // The search result counts appeared on top of the Android navigation bar.
  it("lifts snack bars above the bottom system inset", () => {
    TestBed.createComponent(HostComponent)
    TestBed.inject(MatSnackBar).open("3 resultados", "Fechar")

    const snackBar = document.querySelector(
      ".mat-mdc-snack-bar-container",
    ) as HTMLElement
    expect(snackBar).toBeTruthy()
    expect(getComputedStyle(snackBar).marginBottom).toBe("108px")
  })

  // A section title split as "MINISTÉ-RIO" looked like a misprint.
  describe("hyphenation in the reader", () => {
    let book: HTMLElement

    beforeEach(() => {
      book = document.createElement("div")
      book.className = "bookBlock"
      // As the reader's own (component-scoped) .bookBlock rule sets it.
      book.style.hyphens = "auto"
      book.innerHTML = `
        <p class="text">No princípio havia o Verbo</p>
        <h3>PREPARAÇÃO DO MINISTÉRIO DE JESUS</h3>
        <verse-section><span class="section">Pregação de João Batista</span></verse-section>`
      document.body.appendChild(book)
    })

    afterEach(() => book.remove())

    const hyphens = (selector: string) =>
      getComputedStyle(book.querySelector(selector) as HTMLElement).hyphens

    it("hyphenates the running text", () => {
      expect(hyphens(".text")).toBe("auto")
    })

    it("never hyphenates headings or section titles", () => {
      expect(hyphens("h3")).toBe("manual")
      expect(hyphens("verse-section .section")).toBe("manual")
    })
  })

  // The text started 35 pt under the top buttons, which sit 24 pt under the
  // status bar: the reader's 15px web margin stacked on the bar's inset. The
  // system's own gap is its 8 pt layout margin.
  describe("the reader's top margin in the iOS app", () => {
    const TOP = 106
    const BOTTOM = 83
    let reader: HTMLElement

    beforeEach(() => {
      reader = document.createElement("bible-reader")
      reader.innerHTML = `
        <div class="paged-view-container"></div>
        <div class="bookBlock"></div>`
      document.body.appendChild(reader)
      document.documentElement.style.setProperty(
        "--native-chrome-top",
        `${TOP}px`,
      )
      document.documentElement.style.setProperty(
        "--native-chrome-bottom",
        `${BOTTOM}px`,
      )
    })

    afterEach(() => {
      reader.remove()
      document.body.classList.remove("native-chrome")
      document.documentElement.style.removeProperty("--native-chrome-top")
      document.documentElement.style.removeProperty("--native-chrome-bottom")
    })

    const styleOf = (selector: string) =>
      getComputedStyle(reader.querySelector(selector) as HTMLElement)

    it("starts scrolling text 8px under the bar", () => {
      document.body.classList.add("native-chrome")

      expect(styleOf(".bookBlock").marginTop).toBe("8px")
    })

    it("starts paged text 8px under the bar and still ends the page at the toolbar", () => {
      document.body.classList.add("native-chrome")
      const container = styleOf(".paged-view-container")

      expect(container.marginTop).toBe("8px")
      // Under the bar's inset: margin + page = the screen less both bars.
      expect(
        parseFloat(container.marginTop) + parseFloat(container.height),
      ).toBeCloseTo(window.innerHeight - TOP - BOTTOM, 0)
    })

    it("leaves the web layout to the reader's own margins", () => {
      // The reader's component CSS isn't loaded here, so only this override
      // could have set a margin; without .native-chrome it must not.
      expect(styleOf(".bookBlock").marginTop).toBe("0px")
      expect(styleOf(".paged-view-container").marginTop).toBe("0px")
    })
  })

  // In the dark theme the crimson verse numbers were 3.8:1 on the background,
  // under the 4.5:1 that small text needs.
  describe("verse numbers in the iOS app's dark theme", () => {
    let verse: HTMLElement

    beforeEach(() => {
      verse = document.createElement("verse")
      verse.innerHTML = '<span class="verseNumber">3</span>'
      document.body.appendChild(verse)
      document.documentElement.classList.add("dark-theme")
    })

    afterEach(() => {
      verse.remove()
      document.documentElement.classList.remove("dark-theme")
      document.body.classList.remove("native-chrome")
    })

    const color = () =>
      getComputedStyle(verse.querySelector(".verseNumber") as HTMLElement).color

    it("are iOS's dark red", () => {
      document.body.classList.add("native-chrome")
      expect(color()).toBe("rgb(255, 69, 58)")
    })

    it("are left to the web theme elsewhere", () => {
      expect(color()).not.toBe("rgb(255, 69, 58)")
    })
  })

  // Paged, WebKit cut off the verse numbers hanging left of a line of poetry:
  // the side margin was outside the columns, which clip their content.
  describe("pages in the iOS app on a phone", () => {
    const markup = `
      <bible-reader>
        <div class="paged-view-container">
          <div class="bookBlock paged-view"><div class="chapterBlock"></div></div>
        </div>
      </bible-reader>`
    let frame: HTMLIFrameElement | undefined

    afterEach(() => frame?.remove())

    /** The markup in a 390px-wide page with this page's stylesheets. */
    async function onPhone(nativeChrome: boolean): Promise<Document> {
      frame = document.createElement("iframe")
      frame.style.width = "390px"
      document.body.appendChild(frame)
      const doc = frame.contentDocument as Document
      const loaded: Promise<unknown>[] = []
      for (const sheet of document.querySelectorAll(
        'style, link[rel="stylesheet"]',
      )) {
        const copy = sheet.cloneNode(true) as HTMLElement
        if (copy instanceof HTMLLinkElement) {
          loaded.push(
            new Promise((done) => {
              copy.addEventListener("load", done)
              copy.addEventListener("error", done)
            }),
          )
        }
        doc.head.appendChild(copy)
      }
      await Promise.all(loaded)
      doc.body.innerHTML = markup
      doc.body.classList.toggle("native-chrome", nativeChrome)
      return doc
    }

    it("keeps the side margin inside each page", async () => {
      const doc = await onPhone(true)
      const style = (selector: string) =>
        (doc.defaultView as Window).getComputedStyle(
          doc.querySelector(selector) as HTMLElement,
        )

      expect(style(".chapterBlock").paddingLeft).toBe("15px")
      expect(style(".chapterBlock").paddingRight).toBe("15px")
      // Nothing outside the columns, so a page still advances by the width.
      expect(style(".paged-view").paddingLeft).toBe("0px")
      expect(style(".paged-view").columnGap).toBe("0px")
    })

    it("leaves the web layout's pages alone", async () => {
      const doc = await onPhone(false)
      const chapter = doc.querySelector(".chapterBlock") as HTMLElement

      expect(
        (doc.defaultView as Window).getComputedStyle(chapter).paddingLeft,
      ).toBe("0px")
    })
  })
})
