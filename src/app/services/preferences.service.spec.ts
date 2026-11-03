import { TestBed } from "@angular/core/testing"
import { PreferencesService } from "./preferences.service"

describe("PreferencesService", () => {
  let service: PreferencesService

  beforeEach(() => {
    localStorage.clear()
    TestBed.resetTestingModule()
    TestBed.configureTestingModule({ providers: [PreferencesService] })
    service = TestBed.inject(PreferencesService)
  })

  it("should default study mode off until the reader asks for it", () => {
    expect(service.getStudyMode()).toBe(false)
  })

  it("should store and read the study mode preference", () => {
    service.setStudyMode(true)
    expect(service.getStudyMode()).toBe(true)

    service.setStudyMode(false)
    expect(service.getStudyMode()).toBe(false)
  })

  it("should have study mode's one-letter keys on until the reader turns them off", () => {
    expect(service.getStudyShortcuts()).toBe(true)

    service.setStudyShortcuts(false)
    expect(service.getStudyShortcuts()).toBe(false)

    service.setStudyShortcuts(true)
    expect(service.getStudyShortcuts()).toBe(true)
  })

  describe("study column widths", () => {
    it("starts with none, the layout choosing its own", () => {
      expect(service.getStudyColumnWidths()).toEqual({})
    })

    it("stores and reads them back", () => {
      service.setStudyColumnWidths({ rail: 260, panel: 420, split: 62.5 })

      expect(service.getStudyColumnWidths()).toEqual({
        rail: 260,
        panel: 420,
        split: 62.5,
      })
    })

    it("keeps the dividers the reader has moved and no others", () => {
      service.setStudyColumnWidths({ panel: 420 })

      const widths = service.getStudyColumnWidths()
      expect(widths.panel).toBe(420)
      expect(widths.rail).toBeUndefined()
      expect(widths.split).toBeUndefined()
    })

    it("falls back to the layout's own widths on unreadable storage", () => {
      localStorage.setItem("studyColumnWidths", "{not json")

      expect(service.getStudyColumnWidths()).toEqual({})
    })

    it("drops values that are not numbers a column can be", () => {
      localStorage.setItem(
        "studyColumnWidths",
        JSON.stringify({ rail: "wide", panel: Number.NaN, split: null }),
      )

      expect(service.getStudyColumnWidths()).toEqual({
        rail: undefined,
        panel: undefined,
        split: undefined,
      })
    })
  })

  it("should default both study side columns to open", () => {
    expect(service.getStudySidebarCollapsed()).toBe(false)
    expect(service.getStudyPanelCollapsed()).toBe(false)
  })

  it("should store each study side column's folded state separately", () => {
    service.setStudySidebarCollapsed(true)

    expect(service.getStudySidebarCollapsed()).toBe(true)
    expect(service.getStudyPanelCollapsed()).toBe(false)

    service.setStudyPanelCollapsed(true)
    service.setStudySidebarCollapsed(false)

    expect(service.getStudySidebarCollapsed()).toBe(false)
    expect(service.getStudyPanelCollapsed()).toBe(true)
  })

  it("should store and read the theme", () => {
    service.setTheme("dark")

    expect(service.getTheme()).toBe("dark")
  })

  it("should return null for an invalid theme", () => {
    localStorage.setItem("theme", "purple")

    expect(service.getTheme()).toBeNull()
  })

  it("should store and read font size by context", () => {
    service.setFontSize(120, "reader")

    expect(service.getFontSize("reader")).toBe(120)
    expect(service.getFontSize("other")).toBeNull()
  })

  it("should ignore invalid font size values", () => {
    localStorage.setItem("fontSizedefault", "abc")

    expect(service.getFontSize()).toBeNull()
  })

  it("should only accept positive auto scroll speeds", () => {
    localStorage.setItem("autoScrollLinesPerSecond", "-1")
    expect(service.getAutoScrollSpeed()).toBeNull()

    service.setAutoScrollSpeed(1.5)
    expect(service.getAutoScrollSpeed()).toBe(1.5)
  })

  it("should store auto scroll control visibility", () => {
    service.setAutoScrollControlsVisible(true)

    expect(service.getAutoScrollControlsVisible()).toBe(true)
  })

  it("should treat the onboarding wizard as unseen by default", () => {
    expect(service.getOnboardingSeen()).toBe(false)
  })

  it("should remember that the onboarding wizard was seen", () => {
    service.setOnboardingSeen(true)
    expect(service.getOnboardingSeen()).toBe(true)

    service.setOnboardingSeen(false)
    expect(service.getOnboardingSeen()).toBe(false)
  })

  // The Android app shows it once more with its native bars.
  it("should remember that the wizard was seen with the native bars", () => {
    expect(service.getNativeBarsOnboardingSeen()).toBe(false)

    service.setNativeBarsOnboardingSeen(true)
    expect(service.getNativeBarsOnboardingSeen()).toBe(true)
    // Its own key: the first-launch flag is untouched.
    expect(service.getOnboardingSeen()).toBe(false)
  })

  it("should report the wizard as seen when storage cannot record it", () => {
    // A throwing setItem fails the safeLocalStorage() probe, as blocked
    // storage does; "unseen" would then reopen the wizard on every launch.
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked")
    })

    expect(service.getOnboardingSeen()).toBe(true)
    expect(service.getNativeBarsOnboardingSeen()).toBe(true)
  })

  // Storage that passed the probe can still fail later: full, or revoked.
  it("should carry on when storage fails after the probe", () => {
    service.setTheme("dark")
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("revoked")
    })
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("full")
    })
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
      throw new Error("revoked")
    })

    expect(() => service.setNativeBarsOnboardingSeen(true)).not.toThrow()
    expect(() => service.clearFontSize("reader")).not.toThrow()
    expect(service.getFontSize("reader")).toBeNull()
    // Seen, as with no storage: the wizard does not reopen on every launch.
    expect(service.getOnboardingSeen()).toBe(true)
    expect(service.getNativeBarsOnboardingSeen()).toBe(true)
  })

  it("should store and read the last location", () => {
    service.setLastBookId("gen")
    service.setLastChapterNumber(3)

    expect(service.getLastBookId()).toBe("gen")
    expect(service.getLastChapterNumber()).toBe(3)
  })

  it("should return null for an invalid chapter number", () => {
    localStorage.setItem("chapter", "abc")

    expect(service.getLastChapterNumber()).toBeNull()
  })

  it("should default view mode to scrolling and accept paged", () => {
    expect(service.getViewMode()).toBe("scrolling")

    service.setViewMode("paged")
    expect(service.getViewMode()).toBe("paged")
  })

  it("probes localStorage once instead of on every access", () => {
    // safeLocalStorage() probes with a real write; applyChapter and the
    // header read preferences on every chapter change and render pass.
    service.getTheme()
    const setItem = vi.spyOn(Storage.prototype, "setItem")

    service.getTheme()
    service.getViewMode()
    service.setLastChapterNumber(3)

    // Exactly the one real write, with no probe writes around it.
    expect(setItem).toHaveBeenCalledTimes(1)
    expect(setItem).toHaveBeenCalledWith("chapter", "3")
  })
})
