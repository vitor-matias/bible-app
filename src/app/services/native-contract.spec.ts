import { OverlayContainer } from "@angular/cdk/overlay"
import { DOCUMENT } from "@angular/common"
import { TestBed } from "@angular/core/testing"
import { Capacitor } from "@capacitor/core"
import type { Mock } from "vitest"
import none from "../../../native-contract/none.json"
import page from "../../../native-contract/page.json"
import reader from "../../../native-contract/reader.json"
import readerFilter from "../../../native-contract/reader-filter.json"
import readerMinimal from "../../../native-contract/reader-minimal.json"
import search from "../../../native-contract/search.json"
import { lastCall } from "../testing/spy-obj"
import { NATIVE_CHROME_PLUGIN } from "../tokens"
import { NativeChromeService } from "./native-chrome.service"
import type {
  AutoScrollChrome,
  ReaderChrome,
  SearchChrome,
  TitledPageChrome,
} from "./native-chrome.types"

// The iOS and Android shells parse these same files (native-contract/):
// they are what the service sends. Here the service is driven and what it
// sends must match them, so the three copies of the contract can't drift.

const READER: ReaderChrome = {
  mode: "reader",
  themeMode: "dark",
  passageLabel: "Deuteronómio 3",
  passageShortLabels: ["Dt 3"],
  passageAccessibilityLabel: "Deuteronómio, capítulo 3",
  chapterNavigation: true,
  canGoPrevious: true,
  canGoNext: true,
  search: true,
  viewMode: "paged",
  autoScrollVisible: true,
  autoScrollAvailable: true,
  canShare: true,
  canReport: true,
  bookmarkColor: "red",
  bookmarkName: "vermelho",
  buildVersion: "20261018-120000Z",
  textSize: { percent: 120, min: 80, max: 200, canReset: true },
}

const READER_MINIMAL: ReaderChrome = {
  ...READER,
  themeMode: "system",
  passageLabel: "Génesis 1",
  passageShortLabels: [],
  passageAccessibilityLabel: "Génesis 1",
  chapterNavigation: false,
  canGoPrevious: false,
  canGoNext: false,
  search: false,
  viewMode: null,
  autoScrollVisible: false,
  autoScrollAvailable: false,
  canShare: false,
  canReport: false,
  bookmarkColor: null,
  bookmarkName: null,
  buildVersion: null,
  textSize: null,
}

const SEARCH: SearchChrome = {
  mode: "search",
  themeMode: "dark",
  query: "amor",
}

const PAGE: TitledPageChrome = {
  mode: "page",
  themeMode: "light",
  title: "Livros",
  search: true,
}

const READER_FILTER: ReaderChrome = {
  ...READER,
  passageLabel: "Índice Bíblico-Pastoral",
  passageShortLabels: ["Índice"],
  passageAccessibilityLabel: "Índice Bíblico-Pastoral, Amor",
  chapterNavigation: false,
  canGoPrevious: false,
  canGoNext: false,
  viewMode: null,
  autoScrollVisible: false,
  autoScrollAvailable: false,
  filterPlaceholder: "Filtrar temas",
  filterOpen: true,
  query: "amor",
}

const AUTO_SCROLL: AutoScrollChrome = {
  playing: true,
  speedLabel: "1,5",
  speedAccessibilityLabel: "1,5 linhas por segundo",
  canSlower: true,
  canFaster: true,
  canPlay: false,
}

/**
 * Where `sent` and the fixture disagree: in their keys, or in the kind of a
 * value. A null on either side is let through, as the service can't be made
 * to send every optional field at once (the section heading, the page's
 * colour); the fixture still has to name them.
 */
function differences(sent: unknown, fixture: unknown, path = ""): string[] {
  if (sent === null || fixture === null) return []
  if (
    typeof sent !== typeof fixture ||
    Array.isArray(sent) !== Array.isArray(fixture)
  ) {
    return [
      `${path || "state"}: sent ${typeof sent}, fixture ${typeof fixture}`,
    ]
  }
  // The shells switch on the mode, so its value is part of the contract too.
  if (path === ".mode" && sent !== fixture) {
    return [`.mode: sent ${sent}, fixture ${fixture}`]
  }
  if (typeof sent !== "object") return []
  if (Array.isArray(sent) && Array.isArray(fixture)) {
    return sent.length && fixture.length
      ? differences(sent[0], fixture[0], `${path}[0]`)
      : []
  }
  const a = sent as Record<string, unknown>
  const b = fixture as Record<string, unknown>
  const keys = new Set([...Object.keys(a), ...Object.keys(b)])
  return [...keys].flatMap((key) =>
    key in a && key in b
      ? differences(a[key], b[key], `${path}.${key}`)
      : [`${path}.${key}: only ${key in a ? "sent" : "in the fixture"}`],
  )
}

/** The fields a spec drives, so the sent values can be held to the fixture's. */
function driven(from: object, chrome: object): Record<string, unknown> {
  const values = from as Record<string, unknown>
  return Object.fromEntries(
    Object.keys(chrome).map((key) => [key, values[key]]),
  )
}

describe("the native chrome contract fixtures", () => {
  let setState: Mock

  beforeEach(() => {
    setState = vi
      .fn()
      .mockName("setState")
      .mockResolvedValue({ top: 0, bottom: 0 })
    const root = document.createElement("html")
    TestBed.configureTestingModule({
      providers: [
        {
          provide: NATIVE_CHROME_PLUGIN,
          useValue: {
            setState,
            setProgress: () => Promise.resolve(),
            addListener: () => Promise.resolve({ remove: () => {} }),
          },
        },
        {
          provide: DOCUMENT,
          useValue: {
            body: document.createElement("body"),
            documentElement: root,
            addEventListener: root.addEventListener.bind(root),
            removeEventListener: root.removeEventListener.bind(root),
          },
        },
        {
          provide: OverlayContainer,
          useValue: {
            getContainerElement: () => document.createElement("div"),
          },
        },
      ],
    })
    vi.spyOn(Capacitor, "getPlatform").mockReturnValue("ios")
    vi.spyOn(Capacitor, "isPluginAvailable").mockReturnValue(true)
  })

  function service(): NativeChromeService {
    const service = TestBed.inject(NativeChromeService)
    service.init()
    return service
  }

  const sent = () => lastCall(vi.mocked(setState))[0]

  it("matches what the reader's bars send, with auto-scroll playing", () => {
    const chrome = service()
    chrome.show(READER)
    chrome.setAutoScroll(AUTO_SCROLL)
    expect(differences(sent(), reader)).toEqual([])
    expect(driven(sent(), READER)).toEqual(driven(reader, READER))
    expect(sent().autoScroll).toEqual(reader.autoScroll)
  })

  it("matches what the reader's bars send, with nothing optional", () => {
    service().show(READER_MINIMAL)
    expect(differences(sent(), readerMinimal)).toEqual([])
    expect(driven(sent(), READER_MINIMAL)).toEqual(
      driven(readerMinimal, READER_MINIMAL),
    )
  })

  it("matches what the search page's bars send", () => {
    service().show(SEARCH)
    expect(differences(sent(), search)).toEqual([])
    expect(driven(sent(), SEARCH)).toEqual(driven(search, SEARCH))
  })

  it("matches what a plain page's bars send", () => {
    service().show(PAGE)
    expect(differences(sent(), page)).toEqual([])
    expect(driven(sent(), PAGE)).toEqual(driven(page, PAGE))
  })

  it("matches what a page with a list's filter sends", () => {
    service().show(READER_FILTER)
    expect(differences(sent(), readerFilter)).toEqual([])
    expect(driven(sent(), READER_FILTER)).toEqual(
      driven(readerFilter, READER_FILTER),
    )
  })

  it("matches what is sent once there are no bars", async () => {
    vi.useFakeTimers()
    const chrome = service()
    chrome.show(READER)
    chrome.hide()
    await vi.advanceTimersByTimeAsync(0)
    expect(sent()).toEqual(none)
  })

  it("notices a changed mode", () => {
    expect(differences({ mode: "reading" }, { mode: "reader" })).toEqual([
      ".mode: sent reading, fixture reader",
    ])
  })

  // The comparison itself must notice a rename.
  it("notices a renamed key", () => {
    expect(differences({ inert: false }, { inerted: false })).toEqual([
      ".inert: only sent",
      ".inerted: only in the fixture",
    ])
  })
})
