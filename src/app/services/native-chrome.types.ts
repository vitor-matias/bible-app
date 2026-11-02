import type { PluginListenerHandle } from "@capacitor/core"
import type { OnboardingResult } from "../components/onboarding/onboarding.component"
import type { NativeOnboardingStep } from "../components/onboarding/onboarding-content"
import type { TextSize } from "../directives/unified-gesture.directive"
import type { PassagePickerData } from "../utils/passage-picker"
import type { ThemeMode } from "./theme.service"

/** A tap on a native bar, its menu, the passage picker or the search field. */
export type NativeChromeAction =
  | {
      id:
        | "passage"
        | "previous"
        | "next"
        | "search"
        | "back"
        | "theme-system"
        | "theme-light"
        | "theme-dark"
        | "view-mode"
        | "font-reset"
        | "bookmarks"
        | "auto-scroll"
        | "auto-scroll-toggle"
        | "auto-scroll-slower"
        | "auto-scroll-faster"
        | "share"
        | "report"
        | "about"
        | "help"
        | "privacy"
        | "report-closed"
        /** A tap on the status bar; handled here (scrollToTop). */
        | "scroll-top"
        /** A tap on the toast's button; handled here (toast). */
        | "toast-action"
        /** A tap on the passage left while the bars hide; handled here. */
        | "show-bars"
    }
  /** A size down or up; the Android sheet asks for a `step` (percent) of its own. */
  | { id: "font-decrease" | "font-increase"; step?: number }
  | { id: "goto"; bookId: string; chapter?: number }
  | {
      id:
        | "bookmark-open"
        | "bookmark-set"
        | "bookmark-remove"
        | "bookmark-move"
        | "bookmark-undo"
      color: string
    }
  | { id: "bookmarks-closed" }
  | { id: "footnote-link"; index: number }
  | { id: "footnotes-closed" }
  | { id: "search-input"; text: string }
  | { id: "search-submit"; text: string }
  | { id: "report-submit"; topic: string; details: string }

/** The reader's bars: the menus and search on top; arrows and passage below. */
export interface ReaderChrome {
  mode: "reader"
  themeMode: ThemeMode
  passageLabel: string
  /** Shorter forms, longest first ("Dt 3"), for a toolbar too narrow for the name. */
  passageShortLabels: string[]
  passageAccessibilityLabel: string
  chapterNavigation: boolean
  canGoPrevious: boolean
  canGoNext: boolean
  search: boolean
  /** null hides the view-mode toggle. */
  viewMode: "scrolling" | "paged" | null
  autoScrollVisible: boolean
  autoScrollAvailable: boolean
  canShare: boolean
  canReport: boolean
  /** The colour of the ribbon on this chapter, shown on the bookmark button. */
  bookmarkColor: string | null
  /** Its spoken name ("vermelho"), for VoiceOver. */
  bookmarkName: string | null
  /** When the web bundle was compiled, for the menu's small print. */
  buildVersion: string | null
  /** The text's size and range, which the Android text sheet shows; null where it has none. */
  textSize: TextSize | null
}

/** The search page's bars: Back on top, the search field at the bottom. */
export interface SearchChrome {
  mode: "search"
  themeMode: ThemeMode
  query: string
}

/** A plain page's bars (e.g. the book index): Back, its title and search. */
export interface TitledPageChrome {
  mode: "page"
  themeMode: ThemeMode
  title: string
  search: boolean
}

export type PageChrome = ReaderChrome | SearchChrome | TitledPageChrome

/**
 * Auto-scroll's controls: a play button floating over the text, where the
 * reader drags it, which grows into a capsule with the speed while playing.
 */
export interface AutoScrollChrome {
  playing: boolean
  /**
   * Just the number, "1/2", "1.25". The iOS app shows none: only VoiceOver
   * says the speed, in words (speedAccessibilityLabel).
   */
  speedLabel: string
  /** In words, for VoiceOver: "1,5 linhas por segundo". */
  speedAccessibilityLabel: string
  canSlower: boolean
  canFaster: boolean
  /** False at the page's end, where there's nothing left to play. */
  canPlay: boolean
}

/**
 * Mirrors ChromeState in ios/App/App/NativeChrome.swift and
 * android/…/chrome/ChromeState.kt.
 */
export type NativeChromeState =
  | (PageChrome & {
      inert: boolean
      collapsed: boolean
      /**
       * The page's text has scrolled under the top bar. The Android bar is
       * the page's colour at rest and Material's container colour then.
       */
      scrolled: boolean
      autoScroll: AutoScrollChrome | null
      /**
       * The heading of the section being read, which the Android bar shows
       * under the passage; null before the first one is passed.
       */
      subtitle: string | null
      /**
       * The page's own background (--background-color), which the Android
       * bars take at rest and paint behind the system bars where the page
       * can't reach them.
       */
      pageColor: string | null
    })
  | { mode: "none" }

/** The bookmarks sheet. Mirrors BookmarksSheetState in BookmarksSheet.swift. */
export interface BookmarksSheetState {
  /** What a free ribbon would mark, e.g. "Mateus 11". */
  currentLabel: string
  ribbons: {
    /** The CSS colour name the bookmark stores. */
    color: string
    /** Spoken name, e.g. "Vermelho". */
    name: string
    /** The passage the ribbon marks, e.g. "Mt 5"; null when it is free. */
    label: string | null
    /** Marks the chapter being read. */
    current: boolean
  }[]
  /**
   * Whether this page can be marked; the About page can't, but its ribbons
   * still open their passages.
   */
  canMark: boolean
  /**
   * The ribbon offered to move to this chapter, or, once moved, to move back;
   * null when there is none.
   */
  move: {
    color: string
    /** As the ribbon's adjective: "vermelho". */
    name: string
    /** Where the ribbon is, or was before the move: "Mateus 5". */
    from: string
    /** Moved: the sheet offers to undo it. */
    done: boolean
  } | null
}

/** A verse's footnotes. Mirrors FootnotesSheetState in FootnotesSheet.swift. */
export interface FootnotesSheetState {
  /** The verse, e.g. "Mateus 11,3". */
  title: string
  /** The reader's text size, 1 = 100%: the iPhone's own text size included. */
  fontScale: number
  notes: {
    /** The note's marker, e.g. "3". */
    reference: string
    /** Text runs; a run with `link` is a reference, reported by index. */
    parts: { text: string; link?: number }[]
  }[]
}

/** The report form. Mirrors ReportSheetState in ReportSheet.swift. */
export interface ReportSheetState {
  /** What is being reported on, e.g. "Encontrou algum problema em …?". */
  message: string
  topics: readonly { value: string; label: string }[]
  placeholder: string
  maxLength: number
}

export interface NativeToastOptions {
  /**
   * Makes the whole toast a button, the message its label, with a close
   * button beside it, as Books' "Back to Page" is. It stays until one of them
   * is tapped or another toast replaces it.
   */
  onTap?: () => void
  /** An SF Symbol before the button's label. */
  symbol?: string
  /**
   * The way back to where the reader was ("Voltar para …"): in the Android
   * app it also goes once they have read on a screen's height, as a snackbar
   * would stay over a line of the text otherwise.
   */
  returnToPage?: boolean
}

export interface SheetPresented {
  presented: boolean
}

/** A passage for the shell's share sheet. */
export interface NativeShareOptions {
  /** Mail's subject. */
  title: string
  text: string
  url: string
  /** Heads the link's preview, beside the app's icon. */
  linkTitle: string
}

/** The space the bars cover, in CSS pixels. */
export interface ChromeInsets {
  top: number
  bottom: number
  /**
   * Whether the reader's bars did hide: under VoiceOver the shell keeps them.
   * Older shells don't say.
   */
  collapsed?: boolean
}

/** The Android bars' colours that the web's own surfaces match. */
export interface NativePalette {
  /** For the chapter cards, among the bars: "#EEE7E3". */
  surfaceContainerHigh?: string
}

export interface NativeChromePlugin {
  setState(state: NativeChromeState): Promise<ChromeInsets>
  /**
   * How far through the chapter the reader is, 0 to 1, for the Android bar's
   * progress line; null hides it. Android only.
   */
  setProgress(progress: { value: number | null }): Promise<void>
  showPicker(data: PassagePickerData): Promise<void>
  /**
   * The sheets say whether they were presented: not over another sheet, and
   * then no *-closed event follows. One on its way out is waited for, so its
   * *-closed comes before the answer.
   */
  showBookmarks(state: BookmarksSheetState): Promise<SheetPresented>
  /** Refreshes the bookmarks sheet if it is still open. */
  updateBookmarks(state: BookmarksSheetState): Promise<void>
  showFootnotes(state: FootnotesSheetState): Promise<SheetPresented>
  showToast(options: {
    message: string
    button?: boolean
    symbol?: string
  }): Promise<void>
  /** Takes the toast down, if one is showing. */
  hideToast(): Promise<void>
  showReport(state: ReportSheetState): Promise<SheetPresented>
  /** The answer to report-submit: the sheet closes, or shows `message`. */
  finishReport(result: { sent: boolean; message?: string }): Promise<void>
  /**
   * Resolves once the sheet is dismissed, however that happened; at once,
   * with `presented: false`, when it didn't come up.
   */
  showOnboarding(options: {
    steps: NativeOnboardingStep[]
  }): Promise<SheetPresented & Partial<OnboardingResult>>
  /**
   * Resolves once the share sheet closes; at once, with `completed: false`,
   * when it didn't come up.
   */
  share(options: NativeShareOptions): Promise<{ completed: boolean }>
  addListener(
    eventName: "action",
    listener: (action: NativeChromeAction) => void,
  ): Promise<PluginListenerHandle>
  addListener(
    eventName: "insets",
    listener: (insets: ChromeInsets) => void,
  ): Promise<PluginListenerHandle>
  /** The Android app's bar colours, from the wallpaper or the brown. */
  addListener(
    eventName: "palette",
    listener: (palette: NativePalette) => void,
  ): Promise<PluginListenerHandle>
}
