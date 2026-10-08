import { type ComponentFixture, TestBed } from "@angular/core/testing"
import { MatMenuTrigger } from "@angular/material/menu"
import { By } from "@angular/platform-browser"
import { Capacitor } from "@capacitor/core"
import type {
  AutoScrollChrome,
  ChromeInsets,
  NativeChromeAction,
  NativeChromeState,
  ReaderChrome,
} from "../../services/native-chrome.service"
import { WebChromeBars } from "../../services/web-chrome-bars.service"
import { ChromeBarsComponent } from "./chrome-bars.component"

const READER: ReaderChrome = {
  mode: "reader",
  themeMode: "system",
  passageLabel: "Génesis 1",
  passageAccessibilityLabel: "Livro do Génesis 1",
  chapterNavigation: true,
  canGoPrevious: false,
  canGoNext: true,
  search: true,
  viewMode: "scrolling",
  autoScrollVisible: false,
  autoScrollAvailable: true,
  canShare: true,
  canReport: true,
  bookmarkColor: null,
  bookmarkName: null,
}

const shown = (
  page: Partial<ReaderChrome> = {},
  extra: Partial<{
    collapsed: boolean
    inert: boolean
    autoScroll: AutoScrollChrome | null
  }> = {},
): NativeChromeState => ({
  ...READER,
  ...page,
  inert: false,
  collapsed: false,
  autoScroll: null,
  ...extra,
})

describe("ChromeBarsComponent", () => {
  let fixture: ComponentFixture<ChromeBarsComponent>
  let bars: WebChromeBars
  let sent: NativeChromeAction[]

  function create(platform: "web" | "android" = "web"): void {
    spyOn(Capacitor, "getPlatform").and.returnValue(platform)
    TestBed.configureTestingModule({ imports: [ChromeBarsComponent] })
    bars = TestBed.inject(WebChromeBars)
    sent = []
    void bars.addListener("action", (action) => sent.push(action))
    fixture = TestBed.createComponent(ChromeBarsComponent)
    fixture.detectChanges()
  }

  function show(state: NativeChromeState): Promise<ChromeInsets> {
    const answered = bars.setState(state)
    fixture.detectChanges()
    return answered
  }

  const host = () => fixture.nativeElement as HTMLElement
  const button = (label: string) =>
    host().querySelector(`button[aria-label="${label}"]`) as HTMLButtonElement
  const click = (element: Element) => {
    ;(element as HTMLElement).click()
    fixture.detectChanges()
  }

  afterEach(() => {
    document.querySelector(".cdk-overlay-container")?.replaceChildren()
  })

  it("draws nothing until a page asks for bars", () => {
    create()
    expect(host().querySelector(".chrome")).toBeNull()
  })

  describe("the reader's", () => {
    beforeEach(() => create())

    it("has text, bookmarks and More on top; arrows, the passage and search below", async () => {
      await show(shown())
      expect(button("Texto e aparência")).toBeTruthy()
      expect(button("Marcadores")).toBeTruthy()
      expect(button("Mais")).toBeTruthy()
      expect(button("Capítulo anterior").disabled).toBeTrue()
      expect(button("Capítulo seguinte").disabled).toBeFalse()
      expect(button("Livro do Génesis 1").textContent?.trim()).toBe("Génesis 1")
      expect(button("Pesquisar")).toBeTruthy()
    })

    it("sends the taps as the iOS shell does", async () => {
      await show(shown())
      click(button("Capítulo seguinte"))
      click(button("Livro do Génesis 1"))
      click(button("Pesquisar"))
      click(button("Marcadores"))
      expect(sent).toEqual([
        { id: "next" },
        { id: "passage" },
        { id: "search" },
        { id: "bookmarks" },
      ])
    })

    it("has no arrows where there are no chapters", async () => {
      await show(shown({ chapterNavigation: false, search: false }))
      expect(button("Capítulo anterior")).toBeNull()
      expect(button("Pesquisar")).toBeNull()
    })

    it("fills the bookmark in the colour of the chapter's ribbon", async () => {
      await show(shown({ bookmarkColor: "red", bookmarkName: "vermelho" }))
      const bookmark = button("Marcadores")
      const icon = bookmark.querySelector("mat-icon") as HTMLElement
      expect(icon.classList).toContain("filled")
      expect(icon.style.color).toBe("red")
      expect(bookmark.getAttribute("aria-description")).toBe(
        "marcador vermelho neste capítulo",
      )
    })

    it("hide for reading, and stop taking taps under a panel", async () => {
      await show(shown({}, { collapsed: true }))
      expect(host().querySelector(".chrome")?.classList).toContain("collapsed")

      await show(shown({}, { inert: true }))
      expect(host().querySelector(".chrome")?.hasAttribute("inert")).toBeTrue()
    })

    it("tell the page the space they cover", async () => {
      const insets = await show(shown())
      expect(insets.top).toBeGreaterThan(0)
      expect(insets.bottom).toBeGreaterThan(0)
    })

    describe("text menu", () => {
      const trigger = () =>
        fixture.debugElement
          .queryAll(By.directive(MatMenuTrigger))[0]
          .injector.get(MatMenuTrigger)
      const tile = (label: string) =>
        Array.from(document.querySelectorAll(".menu-tile")).find((tile) =>
          tile.textContent?.trim().endsWith(label),
        ) as HTMLElement

      beforeEach(async () => {
        await show(shown({ themeMode: "dark", viewMode: "paged" }))
        click(button("Texto e aparência"))
      })

      it("offers the theme's three choices, the current one checked", () => {
        expect(tile("Automático").getAttribute("aria-checked")).toBe("false")
        expect(tile("Escuro").getAttribute("aria-checked")).toBe("true")
        expect(tile("Página a página").getAttribute("aria-checked")).toBe(
          "true",
        )
      })

      it("stays open as the text and theme change behind it", () => {
        click(tile("Aumentar texto"))
        click(tile("Claro"))
        expect(sent).toEqual([{ id: "font-increase" }, { id: "theme-light" }])
        expect(trigger().menuOpen).toBeTrue()
      })

      // The page toggles between the two.
      it("changes the reading mode only to the other one", () => {
        click(tile("Página a página"))
        click(tile("Texto contínuo"))
        expect(sent).toEqual([{ id: "view-mode" }])
      })
    })

    describe("More menu", () => {
      const item = (label: string) =>
        Array.from(document.querySelectorAll(".mat-mdc-menu-item")).find(
          (item) => item.textContent?.includes(label),
        ) as HTMLButtonElement | undefined

      it("has auto-scroll, sharing, a report, help and privacy", async () => {
        await show(shown({ autoScrollVisible: true }))
        click(button("Mais"))
        expect(
          item("Deslocamento automático")?.getAttribute("aria-checked"),
        ).toBe("true")
        click(item("Reportar erro") as HTMLElement)
        expect(sent).toEqual([{ id: "report" }])
      })

      it("leaves out what the page can't do", async () => {
        await show(
          shown({
            canShare: false,
            canReport: false,
            autoScrollAvailable: false,
          }),
        )
        click(button("Mais"))
        expect(item("Partilhar")).toBeUndefined()
        expect(item("Reportar erro")).toBeUndefined()
        expect(item("Deslocamento automático")?.disabled).toBeTrue()
      })
    })

    describe("auto-scroll's bar", () => {
      const autoScroll: AutoScrollChrome = {
        playing: true,
        speedLabel: "1 ln/s",
        canSlower: false,
        canFaster: true,
      }

      it("shows the speed, and pause while it plays", async () => {
        await show(shown({}, { autoScroll }))
        expect(host().querySelector(".speed-label")?.textContent?.trim()).toBe(
          "1 ln/s",
        )
        expect(button("Diminuir velocidade").disabled).toBeTrue()
        click(button("Aumentar velocidade"))
        click(button("Pausar"))
        click(button("Fechar o deslocamento automático"))
        expect(sent).toEqual([
          { id: "auto-scroll-faster" },
          { id: "auto-scroll-toggle" },
          { id: "auto-scroll" },
        ])
      })

      it("counts in the space the bars cover", async () => {
        const without = await show(shown())
        const withBar = await show(shown({}, { autoScroll }))
        expect(withBar.bottom).toBeGreaterThan(without.bottom)
      })
    })
  })

  describe("the search page's", () => {
    beforeEach(() => create())

    const field = () =>
      host().querySelector('input[type="search"]') as HTMLInputElement

    it("has Back and the field, ready to type in, with the query", async () => {
      await show({
        mode: "search",
        themeMode: "system",
        query: "luz",
        inert: false,
        collapsed: false,
        autoScroll: null,
      })
      expect(host().querySelector(".bar-title")?.textContent?.trim()).toBe(
        "Pesquisar",
      )
      expect(field().value).toBe("luz")
      expect(document.activeElement).toBe(field())

      click(button("Voltar"))
      expect(sent).toEqual([{ id: "back" }])
    })

    it("sends what is typed, and searches on Return", async () => {
      await show({
        mode: "search",
        themeMode: "system",
        query: "",
        inert: false,
        collapsed: false,
        autoScroll: null,
      })
      field().value = "pastor"
      field().dispatchEvent(new Event("input"))
      fixture.detectChanges()
      field().form?.dispatchEvent(new Event("submit", { cancelable: true }))

      expect(sent).toEqual([
        { id: "search-input", text: "pastor" },
        { id: "search-submit", text: "pastor" },
      ])
      expect(document.activeElement).not.toBe(field())
    })
  })

  it("has Back, a title and search on a plain page", async () => {
    create()
    await show({
      mode: "page",
      themeMode: "system",
      title: "Livros da Bíblia",
      search: true,
      inert: false,
      collapsed: false,
      autoScroll: null,
    })
    expect(host().querySelector(".bar-title")?.textContent?.trim()).toBe(
      "Livros da Bíblia",
    )
    click(button("Pesquisar"))
    expect(sent).toEqual([{ id: "search" }])
  })

  // Each platform keeps its own look.
  it("looks like Angular Material on the web, like Android in the Android app", () => {
    create("web")
    expect(host().classList).toContain("look-web")
    TestBed.resetTestingModule()
    ;(Capacitor.getPlatform as jasmine.Spy).and.returnValue("android")
    TestBed.configureTestingModule({ imports: [ChromeBarsComponent] })
    const android = TestBed.createComponent(ChromeBarsComponent)
    android.detectChanges()
    expect((android.nativeElement as HTMLElement).classList).toContain(
      "look-android",
    )
  })
})
