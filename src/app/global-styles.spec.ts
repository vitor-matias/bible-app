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

  // In the light theme the action ("OK", "Fechar") was black on the dark
  // snackbar: its label is a span, which a global rule paints the text colour
  // instead of the snackbar's button colour. (Specs run without the Material
  // theme, so the colour is set here.)
  it("paints a snack bar's action in the snack bar's button colour", () => {
    TestBed.createComponent(HostComponent)
    TestBed.inject(MatSnackBar).open("Não foi possível carregar.", "OK")

    // The one just opened: earlier specs' may still be on the page.
    const container = Array.from(
      document.querySelectorAll(".mat-mdc-snack-bar-container"),
    ).at(-1) as HTMLElement
    container.style.setProperty(
      "--mat-snack-bar-button-color",
      "rgb(226, 192, 163)",
    )
    const label = container.querySelector(".mdc-button__label") as HTMLElement

    expect(getComputedStyle(label).color).toBe("rgb(226, 192, 163)")
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

  // On the open iPhone Duo the status bar runs down the right side, and the
  // text, centred in the safe area, sat left of the screen's centre. Centred
  // with the scroller, the scroll indicator then ran down the bar.
  describe("the reader's side insets in the iOS app", () => {
    let frame: HTMLIFrameElement

    // The rule is for two-page widths, wider than the Karma frame: a page of
    // that width with this one's styles, a reader with the scrolling view's
    // text and footer and the paged view's fixed footer, and the Duo's
    // insets. Returns how far each stays from the screen's sides.
    const insetsAt = async (width: number, nativeChrome: boolean) => {
      frame = document.createElement("iframe")
      frame.style.width = `${width}px`
      document.body.appendChild(frame)
      const page = frame.contentDocument as Document
      // A cloned <link> loads anew: measured before it has, the page is
      // unstyled.
      const loads: Promise<unknown>[] = []
      for (const sheet of document.querySelectorAll(
        "style, link[rel=stylesheet]",
      )) {
        const clone = page.importNode(sheet, true)
        if (clone instanceof HTMLLinkElement || clone.nodeName === "LINK") {
          loads.push(
            new Promise((resolve, reject) => {
              clone.addEventListener("load", resolve, { once: true })
              clone.addEventListener("error", reject, { once: true })
            }),
          )
        }
        page.head.appendChild(clone)
      }
      await Promise.all(loads)
      page.documentElement.style.setProperty("--app-inset-left", "0px")
      page.documentElement.style.setProperty("--app-inset-right", "60px")
      page.body.classList.toggle("native-chrome", nativeChrome)
      const reader = page.createElement("bible-reader")
      // As the reader's own (component-scoped) .fixed-footer rule sets it.
      const scoped = page.createElement("style")
      scoped.textContent = `.fixed-footer[_ngcontent-reader] {
        position: fixed;
        left: var(--app-inset-left);
        right: var(--app-inset-right);
      }`
      page.head.appendChild(scoped)
      reader.innerHTML = `
        <div class="mat-drawer-content">
          <div><div class="bookBlock"></div></div>
          <div class="copyright-footer"></div>
          <div class="copyright-footer fixed-footer" _ngcontent-reader></div>
        </div>`
      page.body.appendChild(reader)
      const gaps = (selector: string) => {
        const box = (
          reader.querySelector(selector) as HTMLElement
        ).getBoundingClientRect()
        return [box.left, page.documentElement.clientWidth - box.right]
      }
      const fixedFooter = getComputedStyle(
        reader.querySelector(".fixed-footer") as HTMLElement,
      )
      return {
        scroller: gaps(".mat-drawer-content"),
        text: gaps(".mat-drawer-content > div"),
        footer: gaps(".copyright-footer:not(.fixed-footer)"),
        fixedFooter: [fixedFooter.left, fixedFooter.right],
      }
    }

    afterEach(() => frame.remove())

    it("centres the text and its footers on the screen", async () => {
      const insets = await insetsAt(900, true)
      expect(insets.text).toEqual([30, 30])
      expect(insets.footer).toEqual([30, 30])
      expect(insets.fixedFooter).toEqual(["30px", "30px"])
    })

    it("keeps the scroller, and so its scroll indicator, out of the status bar", async () => {
      expect((await insetsAt(900, true)).scroller).toEqual([0, 60])
    })

    it("keeps to the safe area on one-page widths, whose text margin is narrow", async () => {
      expect((await insetsAt(700, true)).text).toEqual([0, 60])
    })

    it("keeps to the safe area on the web", async () => {
      expect((await insetsAt(900, false)).text).toEqual([0, 60])
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
})
