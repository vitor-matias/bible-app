import {
  afterRenderEffect,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  effect,
  inject,
  viewChild,
} from "@angular/core"
import { MatButtonModule } from "@angular/material/button"
import { MatRippleModule } from "@angular/material/core"
import { MatDividerModule } from "@angular/material/divider"
import { MatIconModule } from "@angular/material/icon"
import { MatMenuModule } from "@angular/material/menu"
import { Capacitor } from "@capacitor/core"
import type {
  AutoScrollChrome,
  NativeChromeAction,
  ReaderChrome,
  SearchChrome,
  TitledPageChrome,
} from "../../services/native-chrome.service"
import type { ThemeMode } from "../../services/theme.service"
import { WebChromeBars } from "../../services/web-chrome-bars.service"

type SimpleAction = Extract<NativeChromeAction, { id: string }>["id"]

/** The theme's three choices, as the iOS app's text menu has them. */
const THEMES: readonly {
  mode: ThemeMode
  label: string
  icon: string
  action: SimpleAction
}[] = [
  {
    mode: "system",
    label: "Automático",
    icon: "brightness_auto",
    action: "theme-system",
  },
  { mode: "light", label: "Claro", icon: "light_mode", action: "theme-light" },
  { mode: "dark", label: "Escuro", icon: "dark_mode", action: "theme-dark" },
]

const VIEW_MODES = [
  { mode: "paged", label: "Página a página", icon: "auto_stories" },
  { mode: "scrolling", label: "Texto contínuo", icon: "swipe_vertical" },
] as const

/**
 * The iOS app's bars, drawn by the page in the Android app and in phone
 * browsers (WebChromeBars). Same layout and behaviour as the native ones:
 * text, bookmarks and More on top; arrows, the passage and search below;
 * auto-scroll's controls above them; the search field at the bottom. Same
 * state and the same taps (NativeChromeService), so pages need no code of
 * their own. Each platform keeps its look: Material 3 as native Android apps
 * have it, and Angular Material in the app's colours on the web.
 */
@Component({
  selector: "app-chrome-bars",
  standalone: true,
  imports: [
    MatButtonModule,
    MatDividerModule,
    MatIconModule,
    MatMenuModule,
    MatRippleModule,
  ],
  templateUrl: "./chrome-bars.component.html",
  styleUrl: "./chrome-bars.component.css",
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    "[class.look-android]": "look === 'android'",
    "[class.look-web]": "look === 'web'",
  },
})
export class ChromeBarsComponent {
  private readonly bars = inject(WebChromeBars)
  private readonly destroyRef = inject(DestroyRef)
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef)

  readonly look: "android" | "web" =
    Capacitor.getPlatform() === "android" ? "android" : "web"
  readonly themes = THEMES
  readonly viewModes = VIEW_MODES

  private readonly state = this.bars.state
  readonly shown = computed(() => this.state().mode !== "none")
  readonly reader = computed(() => {
    const state = this.state()
    return state.mode === "reader" ? (state as ReaderChrome) : null
  })
  readonly search = computed(() => {
    const state = this.state()
    return state.mode === "search" ? (state as SearchChrome) : null
  })
  readonly page = computed(() => {
    const state = this.state()
    return state.mode === "page" ? (state as TitledPageChrome) : null
  })
  readonly inert = computed(() => {
    const state = this.state()
    return state.mode !== "none" && state.inert
  })
  readonly collapsed = computed(() => {
    const state = this.state()
    return state.mode !== "none" && state.collapsed
  })
  readonly autoScroll = computed<AutoScrollChrome | null>(() => {
    const state = this.state()
    return state.mode === "reader" ? state.autoScroll : null
  })

  private readonly topBar = viewChild<ElementRef<HTMLElement>>("topBar")
  private readonly bottomBar = viewChild<ElementRef<HTMLElement>>("bottomBar")
  private readonly autoScrollBar =
    viewChild<ElementRef<HTMLElement>>("autoScrollBar")
  private readonly searchInput =
    viewChild<ElementRef<HTMLInputElement>>("searchInput")
  private readonly safeAreaProbe =
    viewChild<ElementRef<HTMLElement>>("safeAreaProbe")

  constructor() {
    // The page pads its content by the bars' size, as for the native ones.
    afterRenderEffect(() => {
      this.state()
      this.measure()
    })

    // The search page opens with its field ready, as on iOS; the query the
    // page holds shows unless people are typing in it.
    let wasSearching = false
    afterRenderEffect(() => {
      const search = this.search()
      const input = this.searchInput()?.nativeElement
      if (!search || !input) {
        wasSearching = false
        return
      }
      if (input !== document.activeElement) input.value = search.query
      if (!wasSearching) input.focus()
      wasSearching = true
    })

    if (typeof window === "undefined") return
    const remeasure = () => this.measure()
    const keyboard = () => this.followKeyboard()
    window.addEventListener("resize", remeasure)
    window.visualViewport?.addEventListener("resize", keyboard)
    window.visualViewport?.addEventListener("scroll", keyboard)
    const observer = new ResizeObserver(remeasure)
    effect(() => {
      observer.disconnect()
      for (const bar of [
        this.topBar(),
        this.bottomBar(),
        this.autoScrollBar(),
      ]) {
        if (bar) observer.observe(bar.nativeElement)
      }
    })
    this.destroyRef.onDestroy(() => {
      window.removeEventListener("resize", remeasure)
      window.visualViewport?.removeEventListener("resize", keyboard)
      window.visualViewport?.removeEventListener("scroll", keyboard)
      observer.disconnect()
    })
  }

  send(id: SimpleAction): void {
    this.bars.send({ id } as NativeChromeAction)
  }

  /** The page toggles; only a change of mode is sent. */
  chooseViewMode(reader: ReaderChrome, mode: "paged" | "scrolling"): void {
    if (reader.viewMode !== mode) this.send("view-mode")
  }

  onSearchInput(text: string): void {
    this.bars.send({ id: "search-input", text })
  }

  /** Return searches, and puts the keyboard away over the results. */
  onSearchSubmit(event: Event, input: HTMLInputElement): void {
    event.preventDefault()
    this.bars.send({ id: "search-submit", text: input.value })
    input.blur()
  }

  clearSearch(input: HTMLInputElement): void {
    input.value = ""
    this.onSearchInput("")
    input.focus()
  }

  /**
   * The space the bars cover, measured from the layout rather than the
   * collapse transforms, as the iOS shell measures it: a page's padding
   * doesn't move as the bars hide.
   */
  private measure(): void {
    if (typeof window === "undefined") return
    const probe = this.safeAreaProbe()?.nativeElement
    const safeArea = probe ? getComputedStyle(probe) : null
    const safeTop = Number.parseFloat(safeArea?.paddingTop ?? "0") || 0
    const safeBottom = Number.parseFloat(safeArea?.paddingBottom ?? "0") || 0

    const top = this.topBar()?.nativeElement
    const lowest = (this.autoScrollBar() ?? this.bottomBar())?.nativeElement
    this.bars.reportInsets({
      top: top ? top.offsetTop + top.offsetHeight : safeTop,
      bottom: lowest ? window.innerHeight - lowest.offsetTop : safeBottom,
    })
  }

  /** The search field rides above the on-screen keyboard. */
  private followKeyboard(): void {
    const viewport = window.visualViewport
    if (!viewport) return
    const keyboard = Math.max(
      0,
      window.innerHeight - viewport.height - viewport.offsetTop,
    )
    this.host.nativeElement.style.setProperty(
      "--keyboard-height",
      `${keyboard}px`,
    )
  }
}
