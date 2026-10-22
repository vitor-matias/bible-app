import { Component } from "@angular/core"
import { TestBed } from "@angular/core/testing"
import { MatSnackBar } from "@angular/material/snack-bar"
import { provideNoopAnimations } from "@angular/platform-browser/animations"
import { RIBBON_COLORS } from "./services/bookmark-ribbons.service"
import { contrastRatio } from "./testing/contrast"

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

  // On a tablet, the pages ended above the copyright, which sat in a band of
  // its own above the corner arrows: most of a column's worth of white.
  describe("the copyright in the Android app's pages", () => {
    const TOP = 88
    // The navigation bar's 24px, then the arrows' row: 16px up, 56px tall.
    const BOTTOM = 96
    let reader: HTMLElement
    let footer: HTMLElement

    beforeEach(() => {
      reader = document.createElement("bible-reader")
      // The drawer's content fills the screen, as in the reader.
      reader.innerHTML = `
        <div class="mat-drawer-content" style="position: fixed; inset: 0; box-sizing: border-box">
          <div class="paged-view-container"><div class="bookBlock paged-view"></div></div>
          <div class="copyright-footer fixed-footer">
            <span><b>© DIFUSORA BÍBLICA</b></span>
            <span class="copyright-details">Reservados todos os direitos.</span>
          </div>
        </div>`
      document.body.appendChild(reader)
      footer = reader.querySelector(".fixed-footer") as HTMLElement
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
      document.body.classList.remove("native-chrome", "platform-android")
      document.documentElement.style.removeProperty("--native-chrome-top")
      document.documentElement.style.removeProperty("--native-chrome-bottom")
    })

    const rect = (selector: string) =>
      (reader.querySelector(selector) as HTMLElement).getBoundingClientRect()

    it("sits between the arrows, in their row, and the page runs down to it", () => {
      document.body.classList.add("native-chrome", "platform-android")
      const rowTop = window.innerHeight - BOTTOM
      const copyright = rect(".fixed-footer")

      expect(copyright.top).toBeCloseTo(rowTop, 0)
      expect(copyright.bottom).toBeCloseTo(rowTop + 56, 0)
      expect(copyright.left).toBeCloseTo(88, 0)
      expect(copyright.right).toBeCloseTo(window.innerWidth - 88, 0)
      // 8px above the row, as the text starts 8px under the bar.
      expect(rect(".paged-view-container").bottom).toBeCloseTo(rowTop - 8, 0)
      // The columns fill it: no band kept back for the copyright.
      expect(rect(".paged-view").height).toBeCloseTo(
        rect(".paged-view-container").height,
        0,
      )
    })

    it("pushes the page up when it is taller than the arrows", () => {
      document.body.classList.add("native-chrome", "platform-android")
      // As at the largest text sizes.
      footer.style.fontSize = "40px"
      const copyright = rect(".fixed-footer")

      expect(copyright.height).toBeGreaterThan(56)
      expect(copyright.bottom).toBeCloseTo(window.innerHeight - BOTTOM + 56, 0)
      expect(rect(".paged-view-container").bottom).toBeCloseTo(
        copyright.top - 8,
        0,
      )
    })

    it("leaves the iOS app's pages as they were", () => {
      document.body.classList.add("native-chrome", "platform-ios")

      expect(
        getComputedStyle(reader.querySelector(".mat-drawer-content") as Element)
          .display,
      ).toBe("block")
      expect(rect(".paged-view-container").bottom).toBeCloseTo(
        window.innerHeight - BOTTOM,
        0,
      )
      document.body.classList.remove("platform-ios")
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

  // The iOS app's glass bars float over the text, which fades out under them.
  // The Android app's Material bars are opaque; WebView 133 garbled the
  // blurred, masked overlay into a frozen patch of old text.
  describe("the text's edge fades under the native bars", () => {
    let reader: HTMLElement

    beforeEach(() => {
      reader = document.createElement("bible-reader")
      document.body.appendChild(reader)
      document.body.classList.add("native-chrome")
    })

    afterEach(() => {
      reader.remove()
      document.body.classList.remove(
        "native-chrome",
        "platform-ios",
        "platform-android",
      )
    })

    const fade = (edge: "::before" | "::after") =>
      getComputedStyle(reader, edge)

    it("blur the text under the iOS app's bars", () => {
      document.body.classList.add("platform-ios")
      expect(fade("::before").backdropFilter).toBe("blur(4px)")
      expect(fade("::after").backdropFilter).toBe("blur(4px)")
    })

    it("are left out of the Android app", () => {
      document.body.classList.add("platform-android")
      expect(fade("::before").content).toBe("none")
      expect(fade("::after").content).toBe("none")
    })
  })

  // Night reading on Android: pure white glared, and crimson on #121212 is
  // 3.75:1, under the 4.5:1 small text needs.
  describe("the Android app's dark theme", () => {
    let probe: HTMLElement

    beforeEach(() => {
      probe = document.createElement("p")
      document.body.appendChild(probe)
      document.documentElement.classList.add("dark-theme")
    })

    afterEach(() => {
      probe.remove()
      document.documentElement.classList.remove("dark-theme")
      document.body.classList.remove("platform-android", "platform-ios")
    })

    const token = (name: string) =>
      getComputedStyle(probe).getPropertyValue(name).trim()

    it("sets the text off-white and the accent in a red that passes", () => {
      document.body.classList.add("platform-android")
      expect(token("--text-color")).toBe("#e8e1dd")
      expect(token("--text-secondary")).toBe("#ff453a")
    })

    it("leaves the iOS app and the web as they were", () => {
      document.body.classList.add("platform-ios")
      expect(token("--text-color")).toBe("#ffffff")
    })
  })

  // The grouped list's grey and white are iOS's system colours; the Android
  // app's Material bars keep the theme's colours around the results.
  describe("the search page's colours in the native apps", () => {
    let search: HTMLElement

    let wasDark: boolean

    beforeEach(() => {
      search = document.createElement("app-search")
      document.body.appendChild(search)
      document.body.classList.add("native-chrome")
      // In the light theme: the dark one's grouped background is black.
      wasDark = document.documentElement.classList.contains("dark-theme")
      document.documentElement.classList.remove("dark-theme")
    })

    afterEach(() => {
      document.documentElement.classList.toggle("dark-theme", wasDark)
      search.remove()
      document.body.classList.remove(
        "native-chrome",
        "platform-ios",
        "platform-android",
      )
    })

    const background = () =>
      getComputedStyle(search).getPropertyValue("--background-color").trim()

    it("are iOS's grouped colours in the iOS app", () => {
      document.body.classList.add("platform-ios")
      expect(background()).toBe("#f2f2f7")
    })

    it("are the theme's in the Android app", () => {
      document.body.classList.add("platform-android")
      expect(background()).not.toBe("#f2f2f7")
    })
  })

  // Orange on a grey tile was 1.7:1, under the 3:1 a ribbon's shape needs:
  // each colour has a darker tone on light surfaces and a lighter one on
  // dark ones, as in the native apps.
  describe("bookmark ribbon tones", () => {
    let probe: HTMLElement
    let wasDark: boolean

    beforeEach(() => {
      probe = document.createElement("span")
      document.body.appendChild(probe)
      wasDark = document.documentElement.classList.contains("dark-theme")
    })

    afterEach(() => {
      probe.remove()
      document.documentElement.classList.toggle("dark-theme", wasDark)
    })

    const resolve = (value: string) => {
      probe.style.color = value
      return getComputedStyle(probe).color
    }

    for (const dark of [false, true]) {
      it(`keep 3:1 against the cards in the ${dark ? "dark" : "light"} theme`, () => {
        document.documentElement.classList.toggle("dark-theme", dark)
        const card = resolve("var(--card-background)")
        for (const ribbon of RIBBON_COLORS) {
          const tone = resolve(`var(--ribbon-${ribbon.value})`)
          expect(contrastRatio(tone, card))
            .withContext(ribbon.value)
            .toBeGreaterThanOrEqual(3)
          // Text on the ribbon (its passage, a chapter number) stays legible.
          expect(contrastRatio(resolve("var(--ribbon-text)"), tone))
            .withContext(`text on ${ribbon.value}`)
            .toBeGreaterThanOrEqual(4)
        }
      })
    }

    it("keep the light tones on surfaces that stay light", () => {
      document.documentElement.classList.add("dark-theme")
      for (const ribbon of RIBBON_COLORS) {
        expect(
          contrastRatio(
            resolve(`var(--ribbon-light-${ribbon.value})`),
            resolve("antiquewhite"),
          ),
        )
          .withContext(ribbon.value)
          .toBeGreaterThanOrEqual(3)
      }
    })
  })
})
