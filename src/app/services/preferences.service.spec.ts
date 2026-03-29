import { PreferencesService } from "./preferences.service"

describe("PreferencesService", () => {
  let service: PreferencesService

  beforeEach(() => {
    localStorage.clear()
    service = new PreferencesService()
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

    expect(service.getAutoScrollControlsVisible()).toBeTrue()
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
})
