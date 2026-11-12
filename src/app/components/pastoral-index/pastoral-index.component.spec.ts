import { BreakpointObserver } from "@angular/cdk/layout"
import { Location } from "@angular/common"
import { provideLocationMocks } from "@angular/common/testing"
import { type ComponentFixture, TestBed } from "@angular/core/testing"
import { MatBottomSheet } from "@angular/material/bottom-sheet"
import { MatDialog } from "@angular/material/dialog"
import { By } from "@angular/platform-browser"
import {
  ActivatedRoute,
  convertToParamMap,
  NavigationEnd,
  NavigationSkipped,
  provideRouter,
  Router,
} from "@angular/router"
import { RouterTestingHarness } from "@angular/router/testing"
import { BehaviorSubject, of, Subject } from "rxjs"
import { UnifiedGesturesDirective } from "../../directives/unified-gesture.directive"
import { AnalyticsService } from "../../services/analytics.service"
import { AppPromoService } from "../../services/app-promo.service"
import { BackButtonService } from "../../services/back-button.service"
import { BibleReferenceService } from "../../services/bible-reference.service"
import { BookService } from "../../services/book.service"
import { BookmarkService } from "../../services/bookmark.service"
import { BuildVersionService } from "../../services/build-version.service"
import { HapticsService } from "../../services/haptics.service"
import { NativeBookmarksService } from "../../services/native-bookmarks.service"
import { NativeChromeService } from "../../services/native-chrome.service"
import type { NativeChromeAction } from "../../services/native-chrome.types"
import { NativeReportService } from "../../services/native-report.service"
import { OnboardingService } from "../../services/onboarding.service"
import { PreferencesService } from "../../services/preferences.service"
import { PwaInstallService } from "../../services/pwa-install.service"
import { SeoService } from "../../services/seo.service"
import { ThemeService } from "../../services/theme.service"
import { ToastService } from "../../services/toast.service"
import { createSpyObj, type SpyObj } from "../../testing/spy-obj"
import { BookmarkSelectorComponent } from "../bookmark-selector/bookmark-selector.component"
import { ReportProblemComponent } from "../report-problem/report-problem.component"
import { PastoralIndexComponent } from "./pastoral-index.component"
import entries from "./pastoral-index.data.json"

/** The canon: abbreviation and chapters, as /v1/books gives them. */
const CANON =
  `Gn 50,Ex 40,Lv 27,Nm 36,Dt 34,Js 24,Jz 21,Rt 4,1 Sm 31,2 Sm 24,1 Rs 22,2 Rs 25,
1 Cr 29,2 Cr 36,Esd 10,Ne 13,Est 10,Jb 42,Sl 150,Pr 31,Ecl 12,Ct 8,Is 66,Jr 52,Lm 5,Ez 48,Dn 14,
Os 14,Jl 4,Am 9,Abd 1,Jn 4,Mq 7,Na 3,Hab 3,Sf 3,Ag 2,Ml 3,Zc 14,Mt 28,Mc 16,Lc 24,Jo 21,At 28,
Rm 16,1 Cor 16,2 Cor 13,Gl 6,Ef 6,Fl 4,Cl 4,1 Ts 5,2 Ts 3,1 Tm 6,2 Tm 4,Tt 3,Flm 1,Heb 13,Tg 5,
1 Pe 5,2 Pe 3,1 Jo 5,2 Jo 1,3 Jo 1,Jd 1,Ap 22,Tb 14,Jdt 16,Sb 19,Sir 51,Br 6,1 Mac 16,2 Mac 15`
    .split(",")
    .map((item) => {
      const [, abrv, chapters] = /^\s*(.+) (\d+)$/.exec(item) as RegExpExecArray
      return {
        id: abrv.toLowerCase(),
        name: abrv,
        shortName: abrv,
        abrv,
        chapterCount: Number(chapters),
      } as Book
    })

describe("PastoralIndexComponent", () => {
  let params: BehaviorSubject<ReturnType<typeof convertToParamMap>>
  let wide: BehaviorSubject<{ matches: boolean }>
  let seo: SpyObj<SeoService>
  let toast: SpyObj<ToastService>
  let onboarding: SpyObj<OnboardingService>
  let bookmarks: BehaviorSubject<Bookmark[]>
  let bottomSheet: SpyObj<MatBottomSheet>
  let dialog: SpyObj<MatDialog>
  let nativeBookmarks: SpyObj<NativeBookmarksService>
  let analyticsOn: boolean
  let nativeReport: SpyObj<NativeReportService>
  let haptics: SpyObj<HapticsService>
  let themes: {
    currentMode: string
    toggleTheme: ReturnType<typeof vi.fn>
    setTheme: ReturnType<typeof vi.fn>
  }
  let actions: Subject<NativeChromeAction>
  let chrome: {
    enabled: boolean
    android: boolean
    actions$: Subject<NativeChromeAction>
    show: ReturnType<typeof vi.fn>
    hide: ReturnType<typeof vi.fn>
    share: ReturnType<typeof vi.fn>
    holdBars: ReturnType<typeof vi.fn>
    showPicker: ReturnType<typeof vi.fn>
    trackScroll: ReturnType<typeof vi.fn>
  }

  async function open(
    slug?: string,
    native = false,
    cameBack = false,
    desktop = false,
    animated = false,
    android = false,
  ) {
    wide = new BehaviorSubject({ matches: desktop })
    // A tap opens its theme at once; "scrolling to a theme" animates.
    vi.spyOn(window, "matchMedia").mockReturnValue({
      matches: !animated,
    } as MediaQueryList)
    params = new BehaviorSubject(convertToParamMap(slug ? { slug } : {}))
    seo = createSpyObj("SeoService", ["updateForPastoralIndex"])
    toast = createSpyObj("ToastService", ["showReturnToIndex"])
    onboarding = createSpyObj("OnboardingService", ["open"])
    bookmarks = new BehaviorSubject<Bookmark[]>([])
    bottomSheet = createSpyObj("MatBottomSheet", ["open"])
    dialog = createSpyObj("MatDialog", ["open"])
    nativeBookmarks = createSpyObj("NativeBookmarksService", ["open"])
    analyticsOn = true
    nativeReport = createSpyObj("NativeReportService", ["open"])
    haptics = createSpyObj("HapticsService", ["selection"])
    themes = { currentMode: "light", toggleTheme: vi.fn(), setTheme: vi.fn() }
    actions = new Subject()
    chrome = {
      enabled: native,
      android,
      actions$: actions,
      show: vi.fn(),
      hide: vi.fn(),
      share: vi.fn().mockResolvedValue(true),
      holdBars: vi.fn(),
      showPicker: vi.fn(),
      trackScroll: vi.fn().mockReturnValue(() => {}),
    }
    TestBed.configureTestingModule({
      imports: [PastoralIndexComponent],
      providers: [
        provideRouter([]),
        { provide: ActivatedRoute, useValue: { paramMap: params } },
        { provide: SeoService, useValue: seo },
        { provide: ToastService, useValue: toast },
        { provide: NativeChromeService, useValue: chrome },
        { provide: ThemeService, useValue: themes },
        { provide: OnboardingService, useValue: onboarding },
        { provide: BookmarkService, useValue: { bookmarks$: bookmarks } },
        { provide: MatBottomSheet, useValue: bottomSheet },
        { provide: MatDialog, useValue: dialog },
        { provide: NativeBookmarksService, useValue: nativeBookmarks },
        { provide: NativeReportService, useValue: nativeReport },
        { provide: HapticsService, useValue: haptics },
        { provide: BackButtonService, useValue: { closeOnBack: vi.fn() } },
        {
          provide: AnalyticsService,
          useValue: {
            areAnalyticsAvailable: () => analyticsOn,
            track: vi.fn(),
          },
        },
        {
          provide: BuildVersionService,
          useValue: {
            getDisplayVersion: () =>
              Promise.resolve({ release: "1.0.0", build: "abc123" }),
          },
        },
        {
          provide: PwaInstallService,
          useValue: { canPromptInstall$: of(true) },
        },
        // No store app here: the menu's store link is the header's to test.
        {
          provide: AppPromoService,
          useValue: { deviceStore: () => null, markSeen: vi.fn() },
        },
        { provide: BreakpointObserver, useValue: { observe: () => wide } },
        {
          provide: BookService,
          useValue: {
            books$: of(CANON),
            getBooks: () => CANON,
            getChapterUrlSegment: (chapter: number) => String(chapter),
            getAboutBook: () => ({ abrv: "Sobre" }) as Book,
            findBook: (abrv: string) =>
              CANON.find(
                (b) => b.abrv.replace(" ", "") === abrv.replace(/\s/g, ""),
              ),
            getUrlAbrv: (book: Book) =>
              book.abrv.replace(" ", "").toLowerCase(),
          },
        },
      ],
    })
    if (cameBack) {
      vi.spyOn(TestBed.inject(Router), "currentNavigation").mockReturnValue({
        trigger: "popstate",
      } as never)
    }
    const fixture = TestBed.createComponent(PastoralIndexComponent)
    fixture.detectChanges()
    await fixture.whenStable()
    return fixture
  }

  /**
   * The panels have no height until their CSS transitions end, which are the
   * browser's: no fake clock reaches them.
   */
  const panelsOpened = () =>
    Promise.allSettled(document.getAnimations().map((a) => a.finished))

  /** Taps a theme's panel header in the list. */
  async function tap(fixture: ComponentFixture<unknown>, slug: string) {
    const el: HTMLElement = fixture.nativeElement
    el.querySelector<HTMLElement>(
      `#tema-${slug} mat-expansion-panel-header`,
    )?.click()
    await fixture.whenStable()
    fixture.detectChanges()
    await fixture.whenStable()
  }

  const hrefs = (fixture: ComponentFixture<PastoralIndexComponent>) =>
    [...fixture.nativeElement.querySelectorAll("a")].map(
      (a: HTMLAnchorElement) => a.getAttribute("href"),
    )

  it("lists every theme under its first letter", async () => {
    const fixture = await open()
    const el: HTMLElement = fixture.nativeElement

    expect(el.querySelectorAll("mat-expansion-panel").length).toBe(
      entries.length,
    )
    // Accents don't make a letter of their own: Água is among the As.
    const sections = el.querySelectorAll("section.letter")
    expect(sections.length).toBeLessThan(26)
    expect(sections[0].querySelector("h2")?.textContent).toBe("A")
    expect(sections[0].textContent).toContain("Água")
    // Closed panels render no definitions.
    expect(el.querySelector("article")).toBeNull()
    expect(seo.updateForPastoralIndex).toHaveBeenCalled()
  })

  it("filters the themes, whatever the accents", async () => {
    const fixture = await open()
    const el: HTMLElement = fixture.nativeElement
    const input = el.querySelector("input") as HTMLInputElement

    input.value = "agua"
    input.dispatchEvent(new Event("input"))
    fixture.detectChanges()
    expect(
      [...el.querySelectorAll("mat-panel-title")].map((t) =>
        t.textContent?.trim(),
      ),
    ).toContain("Água")
    expect(el.querySelectorAll("mat-panel-title").length).toBeLessThan(5)

    input.value = "xyzzy"
    input.dispatchEvent(new Event("input"))
    fixture.detectChanges()
    expect(el.textContent).toContain("Nenhum tema encontrado")
    // Words that aren't titles ("ansiedade") still get somewhere.
    const search = el.querySelector("mat-accordion a") as HTMLAnchorElement
    expect(search.getAttribute("href")).toBe("/search?q=xyzzy")
    expect(search.textContent).toContain("Procurar «xyzzy» na Bíblia")
  })

  it("links an entry's citations to the reader, and its cross-references", async () => {
    const fixture = await open("aarao")
    const el: HTMLElement = fixture.nativeElement

    expect(el.querySelector("#tema-aarao article")).not.toBeNull()
    const links = hrefs(fixture)
    // "Ex 4,14-16; 12; 15,20": the book carries on to bookless citations.
    expect(links).toContain("/ex/4?verseStart=14&verseEnd=16")
    expect(links).toContain("/ex/12")
    expect(links).toContain("/ex/15?verseStart=20&notes=20")
    expect(links).toContain("/indice/sacerdote")
  })

  it("underlines citations and cross-references, the only sign of a link", async () => {
    const fixture = await open("aarao")
    const links = [...fixture.nativeElement.querySelectorAll("article a")]

    expect(links.length).toBeGreaterThan(1)
    for (const link of links) {
      expect(getComputedStyle(link).textDecorationLine).toBe("underline")
    }
  })

  describe("a citation marked (n)", () => {
    const linkOf = async (slug: string, text: string) => {
      const fixture = await open(slug)
      const links = [
        ...fixture.nativeElement.querySelectorAll(`#tema-${slug} article a`),
      ] as HTMLAnchorElement[]
      return links
        .find((a) => a.textContent?.trim() === text)
        ?.getAttribute("href")
    }

    it("asks the reader for its verse's notes", async () => {
      expect(await linkOf("abba", "Mc 14,36")).toBe(
        "/mc/14?verseStart=36&notes=36",
      )
    })

    it("carries a range", async () => {
      expect(await linkOf("amor", "Ex 34,6-7")).toBe(
        "/ex/34?verseStart=6&verseEnd=7&notes=6-7",
      )
    })

    it("asks for nothing without the mark", async () => {
      expect(await linkOf("abba", "23,9")).toBe("/mt/23?verseStart=9")
    })

    // "Ex 12,1-13,10.8 (n).11 (n).15 (n)": the notes are Ex 12's.
    it("reads verses after a chapter range as its first chapter's", async () => {
      const fixture = await open("pascoa")
      const hrefs = [
        ...fixture.nativeElement.querySelectorAll("#tema-pascoa article a"),
      ].map((a: HTMLAnchorElement) => a.getAttribute("href"))
      const text = fixture.nativeElement.querySelector(
        "#tema-pascoa article",
      ).textContent

      expect(hrefs).toContain("/ex/12?verseStart=1")
      for (const verse of [8, 11, 15]) {
        expect(hrefs).toContain(`/ex/12?verseStart=${verse}&notes=${verse}`)
      }
      // Nothing of the text lost or doubled.
      expect(text).toContain("Ex 12,1-13,10.8 (n).11 (n).15 (n)")
    })

    // Perdão: "Mt 5,23-26; 6,12 (n).14-15; 18,21-25.32-35"; the verses after
    // the first range were dropped.
    it("spans all the verses of a list", async () => {
      expect(await linkOf("perdao", "18,21-25.32-35")).toBe(
        "/mt/18?verseStart=21&verseEnd=35",
      )
    })

    it("spans a list past its mark, the notes the mark's verse's", async () => {
      expect(await linkOf("perdao", "6,12 (n).14-15")).toBe(
        "/mt/6?verseStart=12&verseEnd=15&notes=12",
      )
    })

    it("spans a list marked twice, the notes the first mark's", async () => {
      expect(await linkOf("misericordia", "Sb 12,21 (n).24-25")).toBe(
        "/sb/12?verseStart=21&verseEnd=25&notes=21",
      )
    })

    it("finds the verse the mark follows in a list", async () => {
      // "1 Jo 3,16-18.16 (n)": the mark is on the second verses named.
      expect(await linkOf("amor", "1 Jo 3,16-18.16")).toContain("notes=16")
    })
  })

  it("keeps the source's punctuation tight against the citations", async () => {
    const fixture = await open("abba")
    const text = fixture.nativeElement.querySelector("article p").textContent

    expect(text).toContain("Mc 14,36 (n); os cristãos")
    expect(text).not.toMatch(/\s[;.]/)
  })

  it("keeps the page's name at a theme's own address too", async () => {
    await open("amor")

    expect(seo.updateForPastoralIndex).toHaveBeenCalledOnce()
    expect(seo.updateForPastoralIndex).toHaveBeenCalledWith()
  })

  it("follows the address to another theme in the same view", async () => {
    const fixture = await open("aarao")

    params.next(convertToParamMap({ slug: "abel" }))
    fixture.detectChanges()

    expect(fixture.componentInstance.expandedSlug()).toBe("abel")
  })

  it("opens with the printed edition's text", async () => {
    const fixture = await open()
    const text = fixture.nativeElement
      .querySelector(".index-intro")
      .textContent.replace(/\s+/g, " ")
      .trim()

    expect(text).toBe(
      "Este Índice Bíblico-Pastoral apresenta os principais temas bíblicos, fazendo ressaltar a sua evolução no quadro da Revelação divina. A Palavra de Deus foi escrita em três momentos principais: Antigo Testamento, Evangelhos e Cartas. A Liturgia da Palavra dá-lhes a devida importância. Julgamos este Índice muito útil para a escolha dos textos das Celebrações da Palavra, temas de estudo ou oração e reuniões de grupos bíblicos.",
    )
  })

  it("sets the intro as the themes are, not centred", async () => {
    const fixture = await open()
    const intro = fixture.nativeElement.querySelector(".index-intro")

    expect(getComputedStyle(intro).textAlign).toBe("justify")
  })

  // PT Serif stayed named here after the reader moved to Literata, and the
  // index fell back to the system's serif.
  it("sets its text in the reader's font", async () => {
    const fixture = await open()
    const font = (selector: string) =>
      getComputedStyle(fixture.nativeElement.querySelector(selector)).fontFamily

    expect(font(".index-intro")).toContain("Literata")
    expect(font("mat-panel-title")).toContain("Literata")
  })

  describe("the hamburger menu", () => {
    /** The menu's items, in its overlay, by label. */
    async function openMenu(fixture: ComponentFixture<PastoralIndexComponent>) {
      fixture.nativeElement.querySelector('[aria-label="Menu"]').click()
      await fixture.whenStable()
      fixture.detectChanges()
      return (label: string) =>
        [...document.querySelectorAll<HTMLElement>("[mat-menu-item]")].find(
          (item) => item.textContent?.includes(label),
        )
    }

    it("takes the back button's place in the toolbar", async () => {
      const fixture = await open()
      const toolbar = fixture.nativeElement.querySelector("mat-toolbar")

      expect(toolbar.querySelector('[aria-label="Voltar"]')).toBeNull()
      expect(toolbar.querySelector(".content > button")?.textContent).toContain(
        "menu",
      )
      expect(toolbar.querySelector('[aria-label="Pesquisar"]')).not.toBeNull()
    })

    it("is the reader's, less auto-scroll and the view mode", async () => {
      const fixture = await open()
      await openMenu(fixture)
      const labels = [
        ...document.querySelectorAll(".mat-mdc-menu-panel [mat-menu-item]"),
      ].map(
        (item) =>
          item.getAttribute("aria-label") ??
          [...item.querySelectorAll("span")]
            .map((span) => span.textContent?.trim())
            .filter(Boolean)
            .at(-1),
      )

      expect(labels).toEqual([
        "Tema: Claro",
        "Diminuir texto",
        "Aumentar texto",
        "Repor tamanho do texto",
        "Marcadores",
        typeof navigator.share === "function" ? "Partilhar" : "Copiar ligação",
        "Instalar a app",
        "Como usar a app",
        "Sobre a Bíblia",
        "Reportar erro",
        expect.stringContaining("Política de Privacidade"),
      ])
      expect(document.querySelector(".menu-version")?.textContent).toContain(
        "1.0.0 · abc123",
      )
    })

    it("changes the reader's text size here too", async () => {
      const fixture = await open()
      const preferences = TestBed.inject(PreferencesService)
      const before = preferences.getFontSize("reader")
      const accordion = fixture.nativeElement.querySelector("mat-accordion")
      const start = Number.parseFloat(accordion.style.fontSize) || 100
      await openMenu(fixture)

      ;(
        document.querySelector('[aria-label="Aumentar texto"]') as HTMLElement
      ).click()

      expect(Number.parseFloat(accordion.style.fontSize)).toBeGreaterThan(start)
      // The menu stays open, as the text changes behind it.
      expect(
        document.querySelector('[aria-label="Diminuir texto"]'),
      ).not.toBeNull()

      const grown = Number.parseFloat(accordion.style.fontSize)
      ;(
        document.querySelector(
          '[aria-label="Repor tamanho do texto"]',
        ) as HTMLElement
      ).click()
      expect(Number.parseFloat(accordion.style.fontSize)).toBeLessThan(grown)
      if (before === null) preferences.clearFontSize("reader")
      else preferences.setFontSize(before, "reader")
    })

    it("reports a problem on the theme open, by its name", async () => {
      const fixture = await open("amor")
      const item = await openMenu(fixture)

      item("Reportar erro")?.click()

      expect(dialog.open).toHaveBeenCalledWith(
        ReportProblemComponent,
        expect.objectContaining({
          data: {
            book: expect.objectContaining({
              id: "indice/amor",
              shortName: "Amor",
            }),
            chapter: 1,
          },
        }),
      )
    })

    it("offers reporting only where analytics carries the report", async () => {
      const fixture = await open()
      analyticsOn = false
      const item = await openMenu(fixture)

      expect(item("Reportar erro")).toBeUndefined()
    })

    it("opens the ribbons on the theme open, or else on the index", async () => {
      const fixture = await open("amor")
      const item = await openMenu(fixture)
      item("Marcadores")?.click()
      expect(bottomSheet.open).toHaveBeenLastCalledWith(
        BookmarkSelectorComponent,
        { data: { bookId: "indice/amor", chapter: 1 } },
      )

      params.next(convertToParamMap({}))
      fixture.componentInstance.openBookmarks()
      expect(bottomSheet.open).toHaveBeenLastCalledWith(
        BookmarkSelectorComponent,
        { data: { bookId: "indice", chapter: 1 } },
      )
    })

    it("cycles the theme and stays open", async () => {
      const fixture = await open()
      await openMenu(fixture)
      const button = () =>
        document.querySelector<HTMLElement>(
          '.menu-control[aria-label^="Tema:"]',
        )

      expect(button()?.getAttribute("aria-label")).toBe("Tema: Claro")
      button()?.click()

      expect(themes.toggleTheme).toHaveBeenCalled()
      expect(button()).not.toBeNull()
    })

    it("opens the help and the About page", async () => {
      const fixture = await open()
      const navigate = vi
        .spyOn(TestBed.inject(Router), "navigate")
        .mockResolvedValue(true)
      const item = await openMenu(fixture)

      item("Como usar a app")?.click()
      expect(onboarding.open).toHaveBeenCalledWith("menu")

      fixture.componentInstance.openAbout()
      expect(navigate).toHaveBeenCalledWith(["/", "sobre", 1])
    })

    it("links the privacy policy, in a new tab", async () => {
      const fixture = await open()
      const item = await openMenu(fixture)

      const privacy = item("Política de Privacidade")
      expect(privacy?.getAttribute("target")).toBe("_blank")
      expect(privacy?.getAttribute("href")).toContain("politica-de-privacidade")
    })
  })

  describe("ribbons on a theme", () => {
    const ribbon = (bookId: string, color: string): Bookmark => ({
      bookId,
      chapter: 1,
      color,
      timestamp: 1,
    })

    it("has no button of its own in the text", async () => {
      const fixture = await open("amor")

      expect(
        fixture.nativeElement.querySelector("#tema-amor article button"),
      ).toBeNull()
    })

    it("uses the native sheet in the native apps", async () => {
      const fixture = await open("amor", true)

      fixture.componentInstance.openBookmarks()

      expect(nativeBookmarks.open).toHaveBeenCalledWith("indice/amor", 1)
      expect(bottomSheet.open).not.toHaveBeenCalled()
    })

    it("shows the ribbon on the theme's title, even closed", async () => {
      const fixture = await open()
      const el: HTMLElement = fixture.nativeElement
      expect(el.querySelector(".theme-ribbon")).toBeNull()

      bookmarks.next([ribbon("indice/abel", "red")])
      await fixture.whenStable()

      const title = el.querySelector("#tema-abel mat-panel-title")
      expect(title?.querySelector(".theme-ribbon")).not.toBeNull()
      expect(title?.textContent).toContain(", marcador vermelho")
      expect(el.querySelectorAll(".theme-ribbon").length).toBe(1)
    })

    it("ignores a chapter's ribbon", async () => {
      const fixture = await open()
      bookmarks.next([ribbon("gen", "red")])
      await fixture.whenStable()

      expect(fixture.nativeElement.querySelector(".theme-ribbon")).toBeNull()
    })

    it("opens a theme whose address the router already thinks it's at", async () => {
      const fixture = await open("amor")
      const replaceState = vi.spyOn(TestBed.inject(Location), "replaceState")
      await tap(fixture, "abel")
      expect(fixture.componentInstance.entry()?.slug).toBe("abel")

      const router = TestBed.inject(Router)
      ;(router.events as unknown as Subject<unknown>).next(
        new NavigationSkipped(1, "/indice/amor", "", 0),
      )
      await fixture.whenStable()

      expect(fixture.componentInstance.entry()?.slug).toBe("amor")
      expect(replaceState.mock.lastCall?.[0]).toBe("/indice/amor")
    })

    describe("with the real router", () => {
      /** The page at its two routes, as the app has them. */
      async function route(url: string, desktop = false) {
        TestBed.configureTestingModule({
          providers: [provideLocationMocks()],
        })
        ;(await open(undefined, false, false, desktop)).destroy()
        TestBed.inject(Router).resetConfig([
          { path: "indice", component: PastoralIndexComponent },
          { path: "indice/:slug", component: PastoralIndexComponent },
        ])
        const harness = await RouterTestingHarness.create(url)
        return {
          harness,
          page: harness.routeDebugElement
            ?.componentInstance as PastoralIndexComponent,
          router: TestBed.inject(Router),
          location: TestBed.inject(Location),
        }
      }

      it("opens the ribbon's theme the page arrived at, over another", async () => {
        const { harness, page, router, location } = await route("/indice/agua")
        await tap(harness.fixture, "amor")
        expect(location.path()).toBe("/indice/amor")

        await router.navigateByUrl("/indice/agua")
        await harness.fixture.whenStable()

        expect(location.path()).toBe("/indice/agua")
        expect(page.entry()?.slug).toBe("agua")
        expect(page.expandedSlug()).toBe("agua")
      })

      it("closes the open theme for the ribbon of the index", async () => {
        const { harness, page, router, location } = await route("/indice")
        await tap(harness.fixture, "amor")
        expect(location.path()).toBe("/indice/amor")

        await router.navigateByUrl("/indice")
        await harness.fixture.whenStable()

        expect(location.path()).toBe("/indice")
        expect(page.entry()).toBeUndefined()
        expect(page.expandedSlug()).toBeNull()
      })

      it("forgets a followed theme on Back to the index", async () => {
        const { page, router, location } = await route("/indice", true)
        const skipped = vi.fn()
        router.events.subscribe((event) => {
          if (event instanceof NavigationSkipped) skipped(event.url)
        })
        // The app's bootstrap starts this; the harness doesn't.
        router.setUpLocationChangeListener()
        page.follow(new MouseEvent("click"), "amor")
        expect(page.entry()?.slug).toBe("amor")

        location.back()

        await vi.waitFor(() => expect(skipped).toHaveBeenCalledWith("/indice"))
        expect(page.entry()).toBeUndefined()
        expect(location.path()).toBe("/indice")
      })

      it("leaves a change of theme to the route", async () => {
        const { harness, page, router, location } = await route("/indice/agua")
        const replaceState = vi.spyOn(location, "replaceState")

        await router.navigateByUrl("/indice/amor")
        await harness.fixture.whenStable()

        expect(page.entry()?.slug).toBe("amor")
        expect(replaceState).not.toHaveBeenCalled()
      })
    })
  })

  it("offers the way back when a citation is tapped, from its own theme", async () => {
    const fixture = await open(undefined, false, false, true)
    const el: HTMLElement = fixture.nativeElement
    vi.spyOn(TestBed.inject(Router), "navigateByUrl").mockResolvedValue(true)

    el.querySelector<HTMLElement>(
      '#tema-abba article a[href^="/mc/14"]',
    )?.click()

    expect(toast.showReturnToIndex).toHaveBeenCalledWith("abba")
  })

  for (const modifier of ["ctrlKey", "metaKey", "shiftKey", "altKey"]) {
    it(`offers no way back for a citation opened elsewhere with ${modifier}`, async () => {
      const fixture = await open("abba")

      fixture.componentInstance.followCitation(
        new MouseEvent("click", { [modifier]: true }),
        "abba",
      )

      expect(toast.showReturnToIndex).not.toHaveBeenCalled()
    })

    it(`leaves a cross-reference to the browser with ${modifier}`, async () => {
      const fixture = await open("aarao")
      const click = new MouseEvent("click", {
        [modifier]: true,
        cancelable: true,
      })

      fixture.componentInstance.follow(click, "sacerdote")

      expect(click.defaultPrevented).toBe(false)
      expect(fixture.componentInstance.entry()?.slug).toBe("aarao")
    })
  }

  it("offers no way back for a cross-reference, which stays here", async () => {
    const fixture = await open("aarao")
    const el: HTMLElement = fixture.nativeElement

    el.querySelector<HTMLElement>(
      'article a[href="/indice/sacerdote"]',
    )?.click()

    expect(toast.showReturnToIndex).not.toHaveBeenCalled()
  })

  it("keeps a headword's colour and weight when it opens", async () => {
    const fixture = await open()
    const el: HTMLElement = fixture.nativeElement
    const style = () => {
      const title = el.querySelector("#tema-amor mat-panel-title") as Element
      const { color, fontWeight } = getComputedStyle(title)
      return { color, fontWeight }
    }
    const closed = style()

    await tap(fixture, "amor")

    expect(style()).toEqual(closed)
    expect(Number(closed.fontWeight)).toBeGreaterThanOrEqual(700)
  })

  describe("the letter shortcuts", () => {
    const letters = (el: HTMLElement) =>
      [...el.querySelectorAll(".letters button")].map((b) =>
        b.textContent?.trim(),
      )

    it("offer each letter that has themes, in order", async () => {
      const fixture = await open()
      const el: HTMLElement = fixture.nativeElement

      expect(letters(el)[0]).toBe("A")
      expect(letters(el).at(-1)).toBe("Z")
      expect(letters(el).length).toBe(
        el.querySelectorAll("section.letter").length,
      )
      // No theme starts with these.
      expect(letters(el)).not.toContain("X")
    })

    it("go to that letter's themes", async () => {
      const fixture = await open()
      const el: HTMLElement = fixture.nativeElement
      const scroll = vi
        .spyOn(Element.prototype, "scrollIntoView")
        .mockImplementation(() => {})

      const buttons = el.querySelectorAll<HTMLElement>(".letters button")
      ;[...buttons].find((b) => b.textContent?.trim() === "S")?.click()

      expect(scroll.mock.contexts).toEqual([el.querySelector("#letra-S")])
      // So that Tab goes on to the Ss, not on through the letters.
      expect(document.activeElement).toBe(el.querySelector("#letra-S h2"))
      expect(el.querySelector("#letra-S")?.textContent).toContain("Sabedoria")
    })

    it("name themselves for a screen reader", async () => {
      const fixture = await open()
      const button = fixture.nativeElement.querySelector(".letters button")

      expect(button.getAttribute("aria-label")).toBe("Letra A")
    })

    it("offer only the letters the filter leaves", async () => {
      const fixture = await open()
      const el: HTMLElement = fixture.nativeElement

      fixture.componentInstance.query.set("sabedoria")
      await fixture.whenStable()

      expect(letters(el)).toEqual(["S"])
    })

    it("use the scroll bar on a phone, leaving the buttons for the keyboard", async () => {
      const fixture = await open()
      const el: HTMLElement = fixture.nativeElement
      const scroll = vi
        .spyOn(Element.prototype, "scrollIntoView")
        .mockImplementation(() => {})
      const bar = el.querySelector("alphabetical-scroll-bar") as HTMLElement

      expect(bar.getAttribute("aria-hidden")).toBe("true")
      expect(el.querySelectorAll(".letters button").length).toBeGreaterThan(20)
      fixture.componentInstance.scrubTo("S")

      expect(scroll.mock.contexts).toEqual([el.querySelector("#letra-S")])
    })

    it("highlight the letter the page has scrolled to, in both forms", async () => {
      const fixture = await open()
      const el: HTMLElement = fixture.nativeElement
      // The row always shows every letter; the bar, in this short viewport, may
      // show a dot in its place (its own spec).
      const bar = () =>
        el.querySelectorAll("alphabetical-scroll-bar .current").length
      const row = () =>
        el.querySelector(".letters button.current")?.textContent?.trim()
      // The page's scroll events are the browser's: no fake clock reaches them.
      const shows = (letter: string) =>
        vi.waitFor(() => {
          fixture.detectChanges()
          expect(row()).toBe(letter)
        })
      await shows("A")

      el.querySelector("#letra-M")?.scrollIntoView()
      await shows("M")
      await fixture.whenStable()

      expect(bar()).toBe(1)
      expect(
        el
          .querySelector(".letters button.current")
          ?.getAttribute("aria-current"),
      ).toBe("true")
      // The colours of the toolbar's buttons, inner label too.
      const current = el.querySelector(".letters button.current") as HTMLElement
      expect(getComputedStyle(current).backgroundColor).toBe(
        "rgb(250, 235, 215)",
      )
      expect(
        getComputedStyle(current.querySelector(".mdc-button__label") as Element)
          .color,
      ).toBe("rgb(84, 61, 39)")
      window.scrollTo(0, 0)
    })

    it("take the native scrollbar's place on a phone, on this page only", async () => {
      const root = document.documentElement
      const fixture = await open()
      await fixture.whenStable()

      expect(root.classList.contains("no-scrollbar")).toBe(true)
      expect(getComputedStyle(root).scrollbarWidth).toBe("none")

      fixture.destroy()
      expect(root.classList.contains("no-scrollbar")).toBe(false)
    })

    it("leave the native scrollbar alone on desktop", async () => {
      const fixture = await open(undefined, false, false, true)
      await fixture.whenStable()

      expect(document.documentElement.classList.contains("no-scrollbar")).toBe(
        false,
      )
    })

    it("have no scroll bar on desktop", async () => {
      const fixture = await open(undefined, false, false, true)

      expect(
        fixture.nativeElement.querySelector("alphabetical-scroll-bar"),
      ).toBeNull()
    })

    it("stay above the text with the filter, in one sticky bar", async () => {
      const fixture = await open()
      const el: HTMLElement = fixture.nativeElement
      const tools = el.querySelector(".index-tools") as HTMLElement
      const style = getComputedStyle(tools)

      expect(tools.querySelector("input")).not.toBeNull()
      expect(tools.querySelector(".letters")).not.toBeNull()
      expect(style.position).toBe("sticky")
      expect(style.zIndex).toBe("1")
      // As the toolbar's: the themes alone are in a serif.
      const letter = el.querySelector(".letters button") as HTMLElement
      expect(getComputedStyle(letter).fontFamily).toContain("Roboto")
      // Opaque, or the text shows through as it scrolls under.
      expect(style.backgroundColor).not.toBe("rgba(0, 0, 0, 0)")
    })
  })

  it("brings the results into view when filtering from far down", async () => {
    const fixture = await open()
    const el: HTMLElement = fixture.nativeElement
    const input = el.querySelector("input") as HTMLInputElement
    el.querySelector("#letra-M")?.scrollIntoView()
    const scroll = vi
      .spyOn(Element.prototype, "scrollIntoView")
      .mockImplementation(() => {})

    input.value = "a"
    input.dispatchEvent(new Event("input"))
    await fixture.whenStable()

    expect(scroll.mock.contexts).toEqual([el.querySelector("mat-accordion")])
    window.scrollTo(0, 0)
  })

  it("leaves the page alone when filtering from its top", async () => {
    const fixture = await open()
    const el: HTMLElement = fixture.nativeElement
    window.scrollTo(0, 0)
    const scroll = vi
      .spyOn(Element.prototype, "scrollIntoView")
      .mockImplementation(() => {})
    const input = el.querySelector("input") as HTMLInputElement

    input.value = "a"
    input.dispatchEvent(new Event("input"))
    await fixture.whenStable()

    expect(scroll).not.toHaveBeenCalled()
  })

  it("closes the open theme on filtering, on a phone", async () => {
    const fixture = await open("abel")
    const el: HTMLElement = fixture.nativeElement
    const replaceState = vi.spyOn(TestBed.inject(Location), "replaceState")
    const input = el.querySelector("input") as HTMLInputElement

    input.value = "a"
    input.dispatchEvent(new Event("input"))
    await fixture.whenStable()

    expect(fixture.componentInstance.expandedSlug()).toBeNull()
    expect(el.querySelector("mat-expansion-panel.mat-expanded")).toBeNull()
    expect(replaceState.mock.lastCall?.[0]).toBe("/indice")
  })

  it("leaves every theme open on filtering, on a desktop", async () => {
    const fixture = await open("abel", false, false, true)
    const el: HTMLElement = fixture.nativeElement
    const input = el.querySelector("input") as HTMLInputElement

    input.value = "a"
    input.dispatchEvent(new Event("input"))
    await fixture.whenStable()

    expect(el.querySelectorAll("mat-expansion-panel.mat-expanded").length).toBe(
      el.querySelectorAll("mat-expansion-panel").length,
    )
  })

  it("keeps the letters below a theme's size at a large text size", async () => {
    const fixture = await open()
    const el: HTMLElement = fixture.nativeElement
    const textSize = fixture.debugElement
      .query(By.directive(UnifiedGesturesDirective))
      .injector.get(UnifiedGesturesDirective) as unknown as {
      setFontSize(percent: number): void
    }

    textSize.setFontSize(235)

    const size = (selector: string) =>
      Number.parseFloat(
        getComputedStyle(el.querySelector(selector) as Element).fontSize,
      )
    expect(size(".letter > h2")).toBeLessThan(size("mat-accordion"))
  })

  it("keeps the filter on the page, at a phone's width", async () => {
    const fixture = await open()
    const el: HTMLElement = fixture.nativeElement
    el.style.display = "block"
    el.style.width = "375px"

    const field = el.querySelector(".theme-filter") as HTMLElement
    expect(field.getBoundingClientRect().right).toBeLessThanOrEqual(375)
    expect(field.scrollWidth).toBeLessThanOrEqual(field.clientWidth + 1)
  })

  it("expands a theme in place, without navigating", async () => {
    const fixture = await open()
    const el: HTMLElement = fixture.nativeElement
    const navigate = vi.spyOn(TestBed.inject(Router), "navigate")
    const replaceState = vi.spyOn(TestBed.inject(Location), "replaceState")
    expect(el.querySelector("article")).toBeNull()

    await tap(fixture, "amor")

    expect(navigate).not.toHaveBeenCalled()
    expect(el.querySelector("#tema-amor article")).not.toBeNull()
    expect(
      el
        .querySelector("#tema-amor mat-expansion-panel-header")
        ?.getAttribute("aria-expanded"),
    ).toBe("true")
    expect(el.querySelector(".mat-expansion-indicator")).not.toBeNull()
    // The whole list is still there.
    expect(el.querySelectorAll("mat-expansion-panel").length).toBe(
      entries.length,
    )
    // So that Back from a citation finds it open.
    expect(replaceState.mock.lastCall?.[0]).toBe("/indice/amor")
    // The page keeps its one name, whichever theme is open.
    expect(seo.updateForPastoralIndex).toHaveBeenCalledTimes(1)
    expect(el.querySelector("h1")?.textContent).toBe("Índice Bíblico-Pastoral")
  })

  it("folds the theme on a second tap", async () => {
    const fixture = await open()
    const el: HTMLElement = fixture.nativeElement
    const replaceState = vi.spyOn(TestBed.inject(Location), "replaceState")

    await tap(fixture, "amor")
    await tap(fixture, "amor")

    expect(
      el
        .querySelector("#tema-amor mat-expansion-panel-header")
        ?.getAttribute("aria-expanded"),
    ).toBe("false")
    expect(fixture.componentInstance.entry()).toBeUndefined()
    expect(replaceState.mock.lastCall?.[0]).toBe("/indice")
  })

  it("keeps one theme open at a time", async () => {
    const fixture = await open()
    const el: HTMLElement = fixture.nativeElement

    await tap(fixture, "amor")
    await tap(fixture, "abel")

    expect(fixture.componentInstance.entry()?.slug).toBe("abel")
    expect(el.querySelectorAll('[aria-expanded="true"]').length).toBe(1)
  })

  it("settles a theme reached by a jump once at most, and no other", async () => {
    const fixture = await open("aarao")
    const el: HTMLElement = fixture.nativeElement
    vi.spyOn(TestBed.inject(Location), "go").mockImplementation(() => {})
    el.querySelector<HTMLElement>(
      'article a[href="/indice/sacerdote"]',
    )?.click()
    await fixture.whenStable()
    const scroll = vi
      .spyOn(Element.prototype, "scrollIntoView")
      .mockImplementation(() => {})

    fixture.componentInstance.settled("abel")
    expect(scroll).not.toHaveBeenCalled()

    fixture.componentInstance.settled("sacerdote")
    fixture.componentInstance.settled("sacerdote")
    expect(scroll.mock.calls.length).toBeLessThanOrEqual(1)
  })

  for (const query of ["bem aventurancas", "Bem-Aventuranças"]) {
    it(`finds a hyphenated title by "${query}"`, async () => {
      const fixture = await open()
      fixture.componentInstance.query.set(query)

      expect(
        fixture.componentInstance
          .groups()
          .flatMap((group) => group.entries.map((entry) => entry.slug)),
      ).toEqual(["bem-aventurancas"])
    })
  }

  it("opens a cross-reference's theme here, past the filter", async () => {
    const fixture = await open("aarao")
    const el: HTMLElement = fixture.nativeElement
    const navigate = vi.spyOn(TestBed.inject(Router), "navigate")
    fixture.componentInstance.query.set("aarao")
    await fixture.whenStable()

    el.querySelector<HTMLElement>(
      'article a[href="/indice/sacerdote"]',
    )?.click()
    await fixture.whenStable()

    expect(navigate).not.toHaveBeenCalled()
    expect(fixture.componentInstance.entry()?.slug).toBe("sacerdote")
    expect(el.querySelector("#tema-sacerdote article")).not.toBeNull()
    expect(el.querySelectorAll("mat-expansion-panel").length).toBe(
      entries.length,
    )
  })

  it("makes a cross-reference a step Back can undo, and moves focus", async () => {
    const fixture = await open("aarao")
    const el: HTMLElement = fixture.nativeElement
    const location = TestBed.inject(Location)
    const go = vi.spyOn(location, "go").mockImplementation(() => {})
    const replaceState = vi.spyOn(location, "replaceState")

    el.querySelector<HTMLElement>(
      'article a[href="/indice/sacerdote"]',
    )?.click()
    await fixture.whenStable()

    expect(go).toHaveBeenCalledWith("/indice/sacerdote")
    expect(replaceState).not.toHaveBeenCalled()
    expect(document.activeElement?.id).toBe("tema-sacerdote")
  })

  it("leaves a click for a new tab to the browser", async () => {
    const fixture = await open()
    const click = new MouseEvent("click", { metaKey: true, cancelable: true })

    fixture.componentInstance.follow(click, "amor")

    expect(click.defaultPrevented).toBe(false)
    expect(fixture.componentInstance.entry()).toBeUndefined()
  })

  describe("on desktop", () => {
    const expanded = (el: HTMLElement) =>
      el.querySelectorAll('mat-expansion-panel-header[aria-expanded="true"]')
        .length

    it("has every theme open, with its text", async () => {
      const fixture = await open(undefined, false, false, true)
      const el: HTMLElement = fixture.nativeElement

      expect(expanded(el)).toBe(entries.length)
      expect(el.querySelectorAll("article").length).toBe(entries.length)
      // Print has no chevrons; on a phone they say a row opens.
      expect(el.querySelector(".mat-expansion-indicator")).toBeNull()
    })

    // Filtered to "amor", the one letter left stretched into a full-width pill.
    it("keeps a lone letter button its own size", async () => {
      const fixture = await open(undefined, false, false, true)
      const el: HTMLElement = fixture.nativeElement
      const input = el.querySelector("input") as HTMLInputElement
      input.value = "amor"
      input.dispatchEvent(new Event("input"))
      fixture.detectChanges()

      const letters = el.querySelectorAll(".letters button")
      expect(letters.length).toBe(1)
      expect(letters[0].getBoundingClientRect().width).toBeLessThanOrEqual(48)
    })

    // Capping the tracks at 48 px wrapped the row below about 1146 px, under
    // the sticky tools, whose height allows for one row.
    it("keeps every letter on one row", async () => {
      const fixture = await open(undefined, false, false, true)
      const el: HTMLElement = fixture.nativeElement
      const tops = new Set(
        [...el.querySelectorAll(".letters button")].map((button) =>
          Math.round(button.getBoundingClientRect().top),
        ),
      )
      expect(tops.size).toBe(1)
    })

    it("never splits a theme across two columns", async () => {
      const fixture = await open(undefined, false, false, true)
      const el: HTMLElement = fixture.nativeElement
      // The spec viewport is 800 wide, so the two columns apply.
      expect(
        getComputedStyle(el.querySelector(".themes") as Element).columnCount,
      ).toBe("2")
      // The rule, not the layout: Chromium here doesn't split these panels
      // even without it, while the browsers readers use did.
      const splittable = [...el.querySelectorAll("mat-expansion-panel")]
        .filter((panel) => getComputedStyle(panel).breakInside !== "avoid")
        .map((panel) => panel.id)

      expect(splittable).toEqual([])
    })

    it("lets a theme fold, alone, with the address left as it is", async () => {
      const fixture = await open(undefined, false, false, true)
      const el: HTMLElement = fixture.nativeElement
      const replaceState = vi.spyOn(TestBed.inject(Location), "replaceState")

      await tap(fixture, "amor")

      expect(expanded(el)).toBe(entries.length - 1)
      expect(replaceState).not.toHaveBeenCalled()
    })

    it("keeps every theme open when following a cross-reference", async () => {
      const fixture = await open(undefined, false, false, true)
      const el: HTMLElement = fixture.nativeElement
      const scroll = vi
        .spyOn(Element.prototype, "scrollIntoView")
        .mockImplementation(() => {})

      el.querySelector<HTMLElement>(
        '#tema-aarao article a[href="/indice/sacerdote"]',
      )?.click()
      await fixture.whenStable()
      fixture.detectChanges()
      await fixture.whenStable()

      expect(expanded(el)).toBe(entries.length)
      expect(scroll.mock.contexts).toContain(
        el.querySelector("#tema-sacerdote"),
      )
    })

    it("goes to the theme of its address", async () => {
      const scroll = vi
        .spyOn(Element.prototype, "scrollIntoView")
        .mockImplementation(() => {})

      const fixture = await open("amor", false, false, true)
      const el: HTMLElement = fixture.nativeElement

      expect(expanded(el)).toBe(entries.length)
      expect(scroll.mock.contexts).toContain(el.querySelector("#tema-amor"))
    })

    it("folds the rest when the window narrows", async () => {
      const fixture = await open("amor", false, false, true)
      const el: HTMLElement = fixture.nativeElement

      wide.next({ matches: false })
      await fixture.whenStable()
      fixture.detectChanges()
      await fixture.whenStable()

      expect(expanded(el)).toBe(1)
      expect(
        el
          .querySelector("#tema-amor mat-expansion-panel-header")
          ?.getAttribute("aria-expanded"),
      ).toBe("true")
    })

    it("goes back to the theme being read when the screen rotates", async () => {
      const fixture = await open("amor", false, false, true)
      const el: HTMLElement = fixture.nativeElement
      const scroll = vi
        .spyOn(Element.prototype, "scrollIntoView")
        .mockImplementation(() => {})
      vi.useFakeTimers()

      wide.next({ matches: false })
      await vi.advanceTimersByTimeAsync(350)

      expect(scroll.mock.contexts).toContain(el.querySelector("#tema-amor"))
    })

    it("leaves the theme alone if the page goes as the screen rotates", async () => {
      const fixture = await open("amor", false, false, true)
      const scroll = vi
        .spyOn(Element.prototype, "scrollIntoView")
        .mockImplementation(() => {})
      vi.useFakeTimers()

      wide.next({ matches: false })
      await vi.advanceTimersByTimeAsync(1)
      scroll.mockClear()
      fixture.destroy()
      await vi.advanceTimersByTimeAsync(350)

      expect(scroll).not.toHaveBeenCalled()
    })

    it("draws no headword over its own text", async () => {
      const fixture = await open(undefined, false, false, true)
      const el: HTMLElement = fixture.nativeElement
      await panelsOpened()

      const overlapping = [...el.querySelectorAll("mat-expansion-panel")]
        .filter((panel) => {
          const header = panel
            .querySelector("mat-expansion-panel-header")
            ?.getBoundingClientRect()
          const first = panel.querySelector("article p")
          if (!header || !first) return false
          return [...first.getClientRects()].some(
            (line) =>
              Math.min(header.right, line.right) -
                Math.max(header.left, line.left) >
                5 &&
              Math.min(header.bottom, line.bottom) -
                Math.max(header.top, line.top) >
                2,
          )
        })
        .map((panel) => panel.id)

      expect(overlapping).toEqual([])
    })
  })

  describe("scrolling to a theme", () => {
    function scrollSpy() {
      return vi
        .spyOn(Element.prototype, "scrollIntoView")
        .mockImplementation(() => {})
    }

    /** The positions a glide passes through, by frame. */
    function glideSpy() {
      return vi.spyOn(window, "scrollTo").mockImplementation(() => {})
    }

    const wait = (ms: number) => vi.advanceTimersByTimeAsync(ms)

    /** The page up with motion on, and a clock that runs as a spec says. */
    async function openGliding(slug?: string, desktop = false) {
      const fixture = await open(slug, false, false, desktop, true)
      vi.useFakeTimers()
      return fixture
    }

    /** `tap` for a stopped clock, which whenStable would wait on for good. */
    async function tapGliding(
      fixture: ComponentFixture<PastoralIndexComponent>,
      slug: string,
    ) {
      const el: HTMLElement = fixture.nativeElement
      el.querySelector<HTMLElement>(
        `#tema-${slug} mat-expansion-panel-header`,
      )?.click()
      await wait(1)
      fixture.detectChanges()
      await wait(1)
    }

    it("glides there over half a second or more when tapped", async () => {
      const fixture = await openGliding()
      const native = scrollSpy()
      const glide = glideSpy()

      await tapGliding(fixture, "abel")
      await wait(250)
      expect(glide).toHaveBeenCalled()
      const under = glide.mock.calls.length
      await wait(150)

      // Still moving after 400 ms: the browser's own is done by then.
      expect(glide.mock.calls.length).toBeGreaterThan(under)
      expect(native).not.toHaveBeenCalled()
      expect(glide.mock.lastCall?.[0]).toMatchObject({ behavior: "instant" })
    })

    it("doesn't open a theme on arrival once a ribbon has closed it", async () => {
      const fixture = await openGliding()
      glideSpy()
      await tapGliding(fixture, "abel")

      const router = TestBed.inject(Router)
      ;(router.events as unknown as Subject<unknown>).next(
        new NavigationEnd(1, "/indice", "/indice"),
      )
      await wait(2000)

      expect(fixture.componentInstance.expandedSlug()).toBeNull()
    })

    it("finishes the glide, at its title", async () => {
      const fixture = await openGliding()
      // The page really moves, so it arrives, with nothing left to glide.
      const glide = vi.spyOn(window, "scrollTo")

      await tapGliding(fixture, "abel")
      await wait(1100)
      const count = glide.mock.calls.length
      await wait(100)

      expect(count).toBeGreaterThan(5)
      expect(glide.mock.calls.length).toBe(count)
      window.scrollTo(0, 0)
    })

    it("doesn't restart the glide as the panels settle", async () => {
      const fixture = await openGliding()
      const native = scrollSpy()
      glideSpy()

      await tapGliding(fixture, "abel")
      fixture.componentInstance.settled("abel")

      expect(native).not.toHaveBeenCalled()
    })

    for (const type of ["wheel", "touchstart", "pointerdown", "keydown"]) {
      it(`hands the page back on ${type}`, async () => {
        const fixture = await openGliding()
        const glide = glideSpy()

        await tapGliding(fixture, "abel")
        await wait(120)
        window.dispatchEvent(new Event(type))
        await wait(20)
        const count = glide.mock.calls.length
        await wait(200)

        expect(glide.mock.calls.length).toBe(count)
      })
    }

    it("stops when the page goes away", async () => {
      const fixture = await openGliding()
      const glide = glideSpy()

      await tapGliding(fixture, "abel")
      fixture.destroy()
      await wait(20)
      const count = glide.mock.calls.length
      await wait(150)

      expect(glide.mock.calls.length).toBe(count)
    })

    /** Holds the glide still, for a spec to run it to its end when it likes. */
    function freezeFrames() {
      const frames: FrameRequestCallback[] = []
      vi.spyOn(window, "requestAnimationFrame").mockImplementation((frame) => {
        frames.push(frame)
        return frames.length
      })
      return () => {
        for (const time of [0, 99999]) {
          for (const frame of frames.splice(0)) frame(time)
        }
      }
    }

    it("scrolls first, and opens the theme on arrival", async () => {
      const fixture = await openGliding()
      const el: HTMLElement = fixture.nativeElement
      const header = () =>
        el
          .querySelector("#tema-abel mat-expansion-panel-header")
          ?.getAttribute("aria-expanded")
      glideSpy()
      const finishGlide = freezeFrames()

      await tapGliding(fixture, "abel")
      expect(fixture.componentInstance.entry()?.slug).toBe("abel")
      expect(header()).toBe("false")
      expect(el.querySelector("#tema-abel article")).toBeNull()

      finishGlide()
      await wait(1)
      fixture.detectChanges()
      expect(header()).toBe("true")
      expect(el.querySelector("#tema-abel article")).not.toBeNull()
    })

    it("closes the theme before at once, not on arrival", async () => {
      const fixture = await openGliding("aarao")
      const el: HTMLElement = fixture.nativeElement
      glideSpy()
      freezeFrames()

      await tapGliding(fixture, "abel")

      expect(
        el.querySelectorAll('mat-expansion-panel-header[aria-expanded="true"]')
          .length,
      ).toBe(0)
      fixture.destroy()
    })

    it("opens only the last of two themes tapped in a row", async () => {
      const fixture = await openGliding()
      const el: HTMLElement = fixture.nativeElement
      glideSpy()

      await tapGliding(fixture, "abel")
      await wait(100)
      await tapGliding(fixture, "abismo")
      await wait(1100)
      fixture.detectChanges()

      const opened = [
        ...el.querySelectorAll(
          'mat-expansion-panel-header[aria-expanded="true"]',
        ),
      ].map((h) => h.closest("mat-expansion-panel")?.id)
      expect(opened).toEqual(["tema-abismo"])
    })

    it("still opens the theme if the reader scrolls during the glide", async () => {
      const fixture = await openGliding()
      glideSpy()

      await tapGliding(fixture, "abel")
      window.dispatchEvent(new Event("wheel"))
      await wait(1)

      expect(fixture.componentInstance.expandedSlug()).toBe("abel")
    })

    it("doesn't pull the page back once the reader has scrolled", async () => {
      const fixture = await openGliding()
      const glide = glideSpy()
      // A panel reports its opening as its transition ends, after the reader
      // has scrolled. Here it reports at once, so that is held back.
      const settled = vi
        .spyOn(fixture.componentInstance, "settled")
        .mockImplementation(() => {})

      await tapGliding(fixture, "abel")
      window.dispatchEvent(new Event("wheel"))
      await wait(1)
      const count = glide.mock.calls.length
      settled.mockRestore()
      fixture.componentInstance.settled("abel")
      await wait(200)

      expect(glide.mock.calls.length).toBe(count)
    })

    it("glides to a letter on the rail, and the click after a tap leaves it", async () => {
      const fixture = await openGliding()
      const glide = glideSpy()
      const native = scrollSpy()
      const instance = fixture.componentInstance

      instance.scrubTo("S")
      instance.endScrub()
      instance.scrubTo("S")
      await wait(250)
      const under = glide.mock.calls.length
      await wait(150)

      expect(native).not.toHaveBeenCalled()
      expect(under).toBeGreaterThan(0)
      expect(glide.mock.calls.length).toBeGreaterThan(under)
    })

    it("keeps gliding as a finger stays on the rail", async () => {
      const fixture = await openGliding()
      const el: HTMLElement = fixture.nativeElement
      const glide = glideSpy()

      fixture.componentInstance.scrubTo("S")
      await wait(60)
      el.querySelector(".letter-bar")?.dispatchEvent(
        new Event("touchstart", { bubbles: true }),
      )
      await wait(20)
      const count = glide.mock.calls.length
      await wait(150)

      expect(glide.mock.calls.length).toBeGreaterThan(count)
      fixture.destroy()
    })

    it("glides to a letter on the desktop row too", async () => {
      const fixture = await openGliding(undefined, true)
      const glide = glideSpy()
      const native = scrollSpy()

      fixture.componentInstance.goToLetter("S")
      await wait(150)

      expect(native).not.toHaveBeenCalled()
      expect(glide).toHaveBeenCalled()
      fixture.destroy()
    })

    it("holds the title in place as a theme above closes, before gliding", async () => {
      const fixture = await openGliding("aarao")
      const by = vi.spyOn(window, "scrollBy").mockImplementation(() => {})
      const glide = glideSpy()

      await tapGliding(fixture, "abel")
      await wait(100)

      expect(by).toHaveBeenCalledTimes(1)
      expect(by.mock.lastCall?.[0]).toMatchObject({ behavior: "instant" })
      expect(by.mock.invocationCallOrder[0]).toBeLessThan(
        glide.mock.invocationCallOrder[0],
      )
    })

    it("respects a reader who asked for reduced motion", async () => {
      const fixture = await open()
      const scroll = scrollSpy()
      const glide = glideSpy()

      await tap(fixture, "abel")

      expect(scroll).toHaveBeenCalled()
      expect(glide).not.toHaveBeenCalled()
    })

    it("is instant for a theme's address", async () => {
      const scroll = scrollSpy()
      const glide = glideSpy()

      await open("amor")

      expect(scroll).toHaveBeenCalled()
      expect(glide).not.toHaveBeenCalled()
    })

    it("is instant for a cross-reference, however far", async () => {
      const fixture = await open("aarao")
      const el: HTMLElement = fixture.nativeElement
      const scroll = scrollSpy()
      const glide = glideSpy()
      vi.spyOn(TestBed.inject(Location), "go").mockImplementation(() => {})

      el.querySelector<HTMLElement>(
        'article a[href="/indice/sacerdote"]',
      )?.click()
      await fixture.whenStable()

      expect(scroll).toHaveBeenCalled()
      expect(glide).not.toHaveBeenCalled()
    })
  })

  it("opens at the theme of its address", async () => {
    const scroll = vi
      .spyOn(Element.prototype, "scrollIntoView")
      .mockImplementation(() => {})

    const fixture = await open("amor")

    expect(scroll.mock.contexts).toContain(
      fixture.nativeElement.querySelector("#tema-amor"),
    )
  })

  it("stays where it was on Back from a citation", async () => {
    const scroll = vi
      .spyOn(Element.prototype, "scrollIntoView")
      .mockImplementation(() => {})

    const fixture = await open("amor", false, true)

    expect(fixture.nativeElement.querySelector("article")).not.toBeNull()
    expect(scroll).not.toHaveBeenCalled()
  })

  it("sends an unknown theme to the list", async () => {
    const navigate = vi
      .spyOn(Router.prototype, "navigate")
      .mockResolvedValue(true)

    await open("nao-existe")

    expect(navigate).toHaveBeenCalledWith(["/indice"], { replaceUrl: true })
  })

  it("leaves the toolbar to the native apps and answers their buttons", async () => {
    const fixture = await open(undefined, true)
    const navigate = vi
      .spyOn(TestBed.inject(Router), "navigate")
      .mockResolvedValue(true)

    expect(fixture.nativeElement.querySelector("mat-toolbar")).toBeNull()
    expect(chrome.show).toHaveBeenCalledWith(
      expect.objectContaining({ mode: "reader", search: true }),
    )
    actions.next({ id: "search" } as NativeChromeAction)
    expect(navigate).toHaveBeenCalledWith(["/search"])

    fixture.destroy()
    expect(chrome.hide).toHaveBeenCalled()
  })

  describe("at a larger text size", () => {
    // The size is kept in preferences: later specs start from the default.
    afterEach(() => TestBed.inject(PreferencesService).clearFontSize("reader"))

    async function enlarged(native: boolean, android = false) {
      const fixture = await open(
        undefined,
        native,
        false,
        false,
        false,
        android,
      )
      const gestures = fixture.debugElement
        .query((de) => de.name === "mat-accordion")
        .injector.get(UnifiedGesturesDirective)
      for (let i = 0; i < 12; i++) gestures.increaseFontSize(10)
      fixture.detectChanges()
      await fixture.whenStable()
      const el: HTMLElement = fixture.nativeElement
      const size = (selector: string) =>
        Number.parseFloat(
          getComputedStyle(el.querySelector(selector) as Element).fontSize,
        )
      return { el, size }
    }

    // The text-size directive sizes headings against the accordion, itself
    // already scaled: a letter's heading grew to over twice the themes'.
    it("keeps a letter's heading in step with the themes", async () => {
      const { size } = await enlarged(false)
      expect(size(".letter > h2") / size("mat-accordion")).toBeCloseTo(0.9, 1)
    })

    it("keeps the heading in step in the apps too", async () => {
      const { size } = await enlarged(true, true)
      expect(size(".letter > h2") / size("mat-accordion")).toBeCloseTo(0.875, 1)
    })

    // A fixed 24px line cut off the foot of larger titles.
    for (const [label, native, android] of [
      ["on the web", false, false],
      ["on iOS", true, false],
      ["on Android", true, true],
    ] as const) {
      it(`gives a theme's title a line as tall as its text ${label}`, async () => {
        const { el } = await enlarged(native, android)
        const title = getComputedStyle(
          el.querySelector("mat-panel-title") as Element,
        )
        expect(
          Number.parseFloat(title.lineHeight) /
            Number.parseFloat(title.fontSize),
        ).toBeGreaterThan(1.2)
      })
    }
  })

  // On a 393 px phone the intro and themes were justified, with rivers, while
  // the reader beside them was ragged-right.
  describe("on a phone", () => {
    const frame = window.frameElement as HTMLElement | null
    let width = ""

    beforeEach(() => {
      width = frame?.style.width ?? ""
    })

    afterEach(() => {
      if (frame) frame.style.width = width
      document.documentElement.classList.remove("justified-text")
    })

    it("sets the intro and themes ragged-right until justified is chosen", async () => {
      const fixture = await open("amor")
      const el: HTMLElement = fixture.nativeElement
      expect(frame, "the specs run in a frame").toBeTruthy()
      if (frame) frame.style.width = "390px"
      const align = (selector: string) =>
        getComputedStyle(el.querySelector(selector) as Element).textAlign

      expect(align(".index-intro")).toBe("start")
      expect(align("#tema-amor .entry")).toBe("start")

      document.documentElement.classList.add("justified-text")
      expect(align(".index-intro")).toBe("justify")
      expect(align("#tema-amor .entry")).toBe("justify")
    })

    // The web's choice overrode the apps' ragged themes, which neither
    // platform justifies.
    it("keeps the apps' themes ragged when justified is chosen", async () => {
      const fixture = await open("amor", true)
      const el: HTMLElement = fixture.nativeElement
      document.documentElement.classList.add("justified-text")

      const entry = el.querySelector("#tema-amor .entry") as Element
      expect(getComputedStyle(entry).textAlign).toBe("start")
      expect(getComputedStyle(entry).hyphens).toBe("manual")
    })
  })

  describe("in the apps", () => {
    const lastChrome = () => chrome.show.mock.lastCall?.[0]

    /** The filter, as the shell's field reports it. */
    async function typeInField(
      fixture: ComponentFixture<PastoralIndexComponent>,
      text: string,
    ) {
      actions.next({ id: "search-input", text })
      await fixture.whenStable()
      fixture.detectChanges()
      await fixture.whenStable()
    }

    it("has a book's bars: the passage, Marcadores, search and the menus", async () => {
      await open(undefined, true)
      expect(lastChrome()).toEqual(
        expect.objectContaining({
          mode: "reader",
          passageLabel: "Índice Bíblico-Pastoral",
          passageShortLabels: ["Índice"],
          search: true,
          chapterNavigation: false,
          viewMode: null,
          autoScrollAvailable: false,
          bookmarkColor: null,
          canShare: true,
          canReport: true,
          filterPlaceholder: "Filtrar temas",
          filterOpen: false,
        }),
      )
    })

    it("hides the bars as the text is read, as in a chapter", async () => {
      const stop = vi.fn()
      TestBed.resetTestingModule()
      const fixture = await open(undefined, true)
      expect(chrome.trackScroll).toHaveBeenCalledWith(
        document.documentElement,
        document,
      )
      fixture.destroy()
      expect(stop).not.toHaveBeenCalled()
    })

    it("offers the book picker from the passage, on the index", async () => {
      await open(undefined, true)
      actions.next({ id: "passage" })
      const data = chrome.showPicker.mock.lastCall?.[0]
      expect(data.currentBookId).toBe("indice")
      const books = data.sections.flatMap(
        (section: { groups: { books: { id: string }[] }[] }) =>
          section.groups.flatMap((group) => group.books.map((book) => book.id)),
      )
      expect(books.at(-1)).toBe("indice")
    })

    it("goes to the book the picker chose", async () => {
      await open(undefined, true)
      const navigate = vi
        .spyOn(TestBed.inject(Router), "navigate")
        .mockResolvedValue(true)
      actions.next({ id: "goto", bookId: "Gn", chapter: 3 })
      expect(navigate).toHaveBeenCalledWith(["/", "gn", "3"])
    })

    it("goes to the index's top when the picker chooses it", async () => {
      const fixture = await open("abismo", true)
      const navigate = vi
        .spyOn(TestBed.inject(Router), "navigate")
        .mockResolvedValue(true)
      const scroll = vi.spyOn(window, "scrollTo").mockImplementation(() => {})
      actions.next({ id: "goto", bookId: "indice" })
      await fixture.whenStable()
      expect(navigate).not.toHaveBeenCalled()
      expect(TestBed.inject(Location).path()).toBe("/indice")
      expect(fixture.componentInstance.expandedSlug()).toBeNull()
      expect(scroll).toHaveBeenCalledWith({ top: 0, behavior: "instant" })
    })

    it("opens the filter's field from its button", async () => {
      const fixture = await open(undefined, true)
      actions.next({ id: "filter" })
      await fixture.whenStable()
      expect(lastChrome().filterOpen).toBe(true)
    })

    it("leaves an open theme as it is when an empty field closes", async () => {
      const fixture = await open("abel", true)
      actions.next({ id: "filter" })
      actions.next({ id: "filter-close" })
      await fixture.whenStable()
      expect(fixture.componentInstance.entry()?.slug).toBe("abel")
      expect(fixture.componentInstance.expandedSlug()).toBe("abel")
    })

    it("keeps the theme chosen from the results open, in view, as the field empties", async () => {
      const fixture = await open(undefined, true)
      actions.next({ id: "filter" })
      await typeInField(fixture, "abel")
      await tap(fixture, "abel")
      const theme = fixture.nativeElement.querySelector(
        "#tema-abel",
      ) as HTMLElement
      const scroll = vi.spyOn(theme, "scrollIntoView")
      await typeInField(fixture, "")
      expect(TestBed.inject(Location).path()).toBe("/indice/abel")
      expect(fixture.componentInstance.expandedSlug()).toBe("abel")
      expect(
        fixture.nativeElement.querySelectorAll("mat-expansion-panel").length,
      ).toBe(entries.length)
      expect(scroll).toHaveBeenCalled()
    })

    it("closing the field clears the filter and brings every theme back", async () => {
      const fixture = await open(undefined, true)
      actions.next({ id: "filter" })
      await typeInField(fixture, "amor")
      actions.next({ id: "filter-close" })
      await fixture.whenStable()
      fixture.detectChanges()
      await fixture.whenStable()
      expect(lastChrome()).toEqual(
        expect.objectContaining({ filterOpen: false, query: "" }),
      )
      expect(
        fixture.nativeElement.querySelectorAll("mat-expansion-panel").length,
      ).toBe(entries.length)
    })

    it("leaves the toolbar and the filter to the shell", async () => {
      const fixture = await open(undefined, true)
      const el: HTMLElement = fixture.nativeElement
      expect(el.querySelector("mat-toolbar")).toBeNull()
      expect(el.querySelector(".theme-filter")).toBeNull()
      // The letter buttons stay, for VoiceOver and TalkBack.
      expect(el.querySelectorAll(".letters button").length).toBeGreaterThan(0)
    })

    it("marks itself for the apps' list, and not on the web", async () => {
      const fixture = await open(undefined, true)
      expect(fixture.nativeElement.classList).toContain("native")
      expect(fixture.nativeElement.classList).toContain("ios")
      TestBed.resetTestingModule()
      const web = await open()
      expect(web.nativeElement.classList).not.toContain("native")
    })

    it("narrows the list from the shell's field, whose text it echoes", async () => {
      const fixture = await open(undefined, true)
      await typeInField(fixture, "amor")
      const titles = [
        ...fixture.nativeElement.querySelectorAll("mat-panel-title"),
      ].map((title: Element) => title.textContent?.trim())
      expect(titles).toContain("Amor")
      expect(titles).not.toContain("Abbá")
      expect(lastChrome().query).toBe("amor")
    })

    it("closes the open theme as the field filters", async () => {
      const fixture = await open("amor", true)
      expect(fixture.nativeElement.querySelector("article")).not.toBeNull()
      await typeInField(fixture, "a")
      expect(TestBed.inject(Location).path()).toBe("/indice")
      expect(fixture.componentInstance.expandedSlug()).toBeNull()
    })

    it("lets the results take the screen, from their top", async () => {
      const fixture = await open(undefined, true)
      const scrollTo = vi.spyOn(window, "scrollTo").mockImplementation(() => {})
      expect(fixture.nativeElement.querySelector(".index-intro")).not.toBeNull()
      await typeInField(fixture, "amor")
      expect(fixture.nativeElement.querySelector(".index-intro")).toBeNull()
      expect(scrollTo).toHaveBeenCalledWith({ top: 0, behavior: "instant" })
    })

    it("clears the field when a cross-reference clears the filter", async () => {
      const fixture = await open("abba", true)
      await typeInField(fixture, "ab")
      fixture.componentInstance.follow(new MouseEvent("click"), "amor")
      await fixture.whenStable()
      expect(lastChrome()).toEqual(
        expect.objectContaining({ query: "", filterOpen: false }),
      )
    })

    it("opens a tapped theme at once, without waiting for the page", async () => {
      const fixture = await open(undefined, true, false, false, true)
      await tap(fixture, "abel")
      // On the web the page gets there first: here it's already open.
      expect(fixture.componentInstance.expandedSlug()).toBe("abel")
      expect(TestBed.inject(Location).path()).toBe("/indice/abel")
    })

    it("keeps the bars where they are as the page moves to a tapped theme", async () => {
      const fixture = await open(undefined, true, false, false, true)
      await tap(fixture, "abel")
      expect(chrome.holdBars).toHaveBeenCalled()
    })

    it("keeps its list at a width that shows two columns on the web", async () => {
      const fixture = await open(undefined, true, false, true)
      expect(fixture.componentInstance.wide()).toBe(false)
      expect(fixture.nativeElement.querySelector("article")).toBeNull()
    })

    it("sends the theme's ribbon to the bar, as it changes", async () => {
      const fixture = await open("amor", true)
      expect(lastChrome().bookmarkColor).toBeNull()
      bookmarks.next([
        { bookId: "indice/amor", chapter: 1, color: "red" } as Bookmark,
      ])
      await fixture.whenStable()
      expect(lastChrome().bookmarkColor).toBe("red")
      expect(lastChrome().passageAccessibilityLabel).toBe(
        "Índice Bíblico-Pastoral, Amor, marcador vermelho",
      )
    })

    it("sends the index's own ribbon with no theme open", async () => {
      const fixture = await open(undefined, true)
      bookmarks.next([
        { bookId: "indice", chapter: 1, color: "blue" } as Bookmark,
      ])
      await fixture.whenStable()
      expect(lastChrome().bookmarkColor).toBe("blue")
    })

    it("opens Marcadores from the bar", async () => {
      await open("amor", true)
      actions.next({ id: "bookmarks" })
      expect(nativeBookmarks.open).toHaveBeenCalledWith("indice/amor", 1)
    })

    it("follows the menu's theme, and shows the choice", async () => {
      const fixture = await open(undefined, true)
      actions.next({ id: "theme-dark" })
      await fixture.whenStable()
      expect(themes.setTheme).toHaveBeenCalledWith("dark")
      expect(lastChrome().themeMode).toBe("dark")
    })

    it("changes the text size from the menu, and tells the bars", async () => {
      const fixture = await open(undefined, true)
      const before = lastChrome().textSize.percent
      actions.next({ id: "font-increase", step: 10 })
      await fixture.whenStable()
      expect(lastChrome().textSize.percent).toBeGreaterThan(before)
      actions.next({ id: "font-reset" })
      await fixture.whenStable()
      expect(lastChrome().textSize.percent).toBe(before)
    })

    it("shares through the shell", async () => {
      await open("amor", true)
      actions.next({ id: "share" })
      await Promise.resolve()
      expect(chrome.share).toHaveBeenCalledWith(
        expect.objectContaining({
          text: "Ler Amor no Índice Bíblico-Pastoral.",
        }),
      )
    })

    it("reports a problem in the native form, not the dialog", async () => {
      await open("amor", true)
      actions.next({ id: "report" })
      expect(nativeReport.open).toHaveBeenCalledWith(
        expect.objectContaining({ id: "indice/amor", name: "Amor" }),
        1,
      )
      expect(dialog.open).not.toHaveBeenCalled()
    })

    it("opens help, About and the privacy policy from the menu", async () => {
      const fixture = await open(undefined, true)
      const navigate = vi
        .spyOn(TestBed.inject(Router), "navigate")
        .mockResolvedValue(true)
      const popup = vi.spyOn(window, "open").mockReturnValue(null)
      actions.next({ id: "help" })
      expect(onboarding.open).toHaveBeenCalledWith("menu")
      actions.next({ id: "about" })
      expect(navigate).toHaveBeenCalled()
      actions.next({ id: "privacy" })
      expect(popup).toHaveBeenCalled()
      fixture.destroy()
    })

    it("puts a closed row back in view from far down its text", async () => {
      const fixture = await open("amor", true)
      await panelsOpened()
      const theme = fixture.nativeElement.querySelector(
        "#tema-amor",
      ) as HTMLElement
      vi.spyOn(theme, "getBoundingClientRect").mockReturnValue({
        top: -300,
      } as DOMRect)
      const scroll = vi.spyOn(theme, "scrollIntoView")
      fixture.componentInstance.closed("amor")
      await fixture.whenStable()
      fixture.detectChanges()
      await fixture.whenStable()
      expect(scroll).toHaveBeenCalled()
    })

    describe("on iOS, the section index", () => {
      it("doesn't magnify or mark a current letter", async () => {
        const fixture = await open(undefined, true)
        const bar = fixture.debugElement.query(
          (de) => de.name === "alphabetical-scroll-bar",
        ).componentInstance
        expect(bar.magnify()).toBe(false)
        expect(bar.current()).toBeNull()
      })

      it("jumps to the letter under the finger, with a tick", async () => {
        const fixture = await open(undefined, true, false, false, true)
        const section = fixture.nativeElement.querySelector(
          "#letra-M",
        ) as HTMLElement
        const scroll = vi.spyOn(section, "scrollIntoView")
        const glide = vi.spyOn(window, "requestAnimationFrame")
        fixture.componentInstance.scrubTo("M")
        expect(scroll).toHaveBeenCalled()
        expect(haptics.selection).toHaveBeenCalled()
        expect(glide).not.toHaveBeenCalled()
        expect(chrome.holdBars).toHaveBeenCalled()
      })

      it("goes away while filtering", async () => {
        const fixture = await open(undefined, true)
        await typeInField(fixture, "amor")
        expect(fixture.nativeElement.querySelector(".letter-bar")).toBeNull()
      })
    })

    describe("on Android", () => {
      const androidApp = () => open(undefined, true, false, false, false, true)

      it("has a fast scroller, not iOS's section index", async () => {
        const fixture = await androidApp()
        expect(fixture.nativeElement.classList).toContain("android")
        expect(
          fixture.nativeElement.querySelector("fast-scroller"),
        ).not.toBeNull()
        expect(fixture.nativeElement.querySelector(".letter-bar")).toBeNull()
      })

      it("takes the fast scroller away while filtering", async () => {
        const fixture = await androidApp()
        await typeInField(fixture, "amor")
        expect(fixture.nativeElement.querySelector("fast-scroller")).toBeNull()
      })

      it("ripples only on Android", async () => {
        const fixture = await androidApp()
        const rows = (f: ComponentFixture<PastoralIndexComponent>) =>
          f.nativeElement.querySelector("mat-expansion-panel-header")
        expect(rows(fixture).classList).toContain("mat-ripple")
        await tap(fixture, "abel")
        expect(rows(fixture).querySelector(".mat-ripple-element")).toBeDefined()
      })
    })
  })

  describe("the shipped data", () => {
    it("has only citations of real books and chapters", () => {
      TestBed.configureTestingModule({
        providers: [
          {
            provide: BookService,
            useValue: { books$: of(CANON), getBooks: () => CANON },
          },
        ],
      })
      const parser = TestBed.inject(BibleReferenceService)
      const wrong: string[] = []
      let citations = 0
      for (const entry of entries) {
        for (const parts of entry.paragraphs) {
          for (const part of parts) {
            if (typeof part !== "string") continue
            for (const ref of parser.extract(part)) {
              citations++
              const compact = ref.book.replace(/\s/g, "").toLowerCase()
              const book = CANON.find(
                (b) => b.abrv.replace(/\s/g, "").toLowerCase() === compact,
              )
              if (!book || ref.chapter > book.chapterCount) {
                wrong.push(`${entry.title}: ${ref.book} / ${ref.match}`)
              }
            }
          }
        }
      }
      expect(wrong).toEqual([])
      expect(citations).toBeGreaterThan(6000)
    })

    it("has no hyphens left from the source's line breaks", () => {
      const text = JSON.stringify(entries)

      expect(text).not.toContain("regressa- dos")
      expect(text.match(/\p{Ll}- \p{Ll}/gu)).toBeNull()
    })

    it("marks the printed index's sub-themes as it does", () => {
      const resto = entries.find((entry) => entry.slug === "resto")

      expect(resto?.paragraphs[1][0]).toMatch(/^➢ Paulo recorre/)
    })

    const entry = (slug: string) => entries.find((theme) => theme.slug === slug)
    const text = (slug: string) =>
      (entry(slug)?.paragraphs ?? [])
        .flat()
        .map((part) => (typeof part === "string" ? part : part.text))
        .join("")
    const links = (slug: string) =>
      (entry(slug)?.paragraphs ?? [])
        .flat()
        .flatMap((part) => (typeof part === "string" ? [] : [part.slug]))

    it("gives the theme Paz its own entry, out of Paulo", () => {
      expect(text("paz-messianica")).toMatch(/^Paz \(shalom\)/)
      expect(text("paulo")).not.toContain("shalom")
      expect(links("reconciliacao")).toContain("paz-messianica")
    })

    it("sends citations with a typo in the source to the right book", () => {
      expect(text("vocacao")).toContain("Jeremias: Jr 1,4-19")
      expect(text("encarnacao")).toContain("Gl 4,4")
      expect(text("mediador")).toContain("Gl 3,1-9")
    })

    it("has no markup leaked from the source", () => {
      expect(text("escritura")).toBe("Ver Bíblia e Palavra de Deus.")
      expect(JSON.stringify(entries)).not.toContain("&gt;")
      expect(JSON.stringify(entries)).not.toContain('\\">')
    })

    it("links a Ver the source left as plain text", () => {
      expect(links("perdao")).toEqual(
        expect.arrayContaining(["amor", "penitencia"]),
      )
      expect(links("amor")).toContain("matrimonio")
    })

    it("sends Aarão to the priesthood of its own Testament", () => {
      expect(links("aarao")).toContain("sacerdote")
      expect(links("aarao")).not.toContain("sacerdocio-cristao")
    })

    it("keeps a name the source splits as one link", () => {
      const maranatha = entries.find((entry) => entry.slug === "maranatha")

      expect(maranatha?.paragraphs).toEqual([
        ["Ver ", { text: "Vem, Senhor", slug: "vem-senhor" }, "."],
      ])
    })

    it("keeps a list apart from the numbered book after it", () => {
      const joined = entries.flatMap((entry) =>
        entry.paragraphs
          .flat()
          .flatMap((part) =>
            typeof part === "string"
              ? (part.match(/\(n\)\.\d+ \p{Lu}/gu) ?? [])
              : [],
          ),
      )
      expect(joined).toEqual([])
    })

    it("links cross-references only to entries that exist", () => {
      const slugs = new Set(entries.map((entry) => entry.slug))
      const dangling = entries.flatMap((entry) =>
        entry.paragraphs
          .flat()
          .flatMap((part) =>
            typeof part !== "string" && !slugs.has(part.slug)
              ? [part.slug]
              : [],
          ),
      )
      expect(dangling).toEqual([])
    })
  })
})
