import { TestBed } from "@angular/core/testing"
import { TextAlignService } from "./text-align.service"

describe("TextAlignService", () => {
  const classes = document.documentElement.classList
  const onPhone = (phone: boolean) =>
    vi
      .spyOn(window, "matchMedia")
      .mockReturnValue({ matches: phone } as MediaQueryList)
  const clear = () => {
    localStorage.removeItem("raggedText")
    classes.remove("ragged-text", "justified-text")
  }

  beforeEach(() => {
    clear()
    TestBed.resetTestingModule()
  })

  afterEach(clear)

  // As styles.css: only the reader's own ragged choice stops hyphenation; a
  // phone's ragged default still hyphenates.
  it("hyphenates unless the reader chose ragged-right", () => {
    onPhone(true)
    const service = TestBed.inject(TextAlignService)
    expect(service.ragged).toBe(true)
    expect(service.hyphenated).toBe(true)

    service.toggle()
    expect(service.hyphenated).toBe(true)
    service.toggle()
    expect(service.ragged).toBe(true)
    expect(service.hyphenated).toBe(false)
  })

  it("is justified by default on a wider screen", () => {
    onPhone(false)
    const service = TestBed.inject(TextAlignService)
    expect(service.ragged).toBe(false)
    expect(classes.contains("ragged-text")).toBe(false)
  })

  // The menus said Justificado over a phone's ragged-right text, and choosing
  // it changed nothing.
  it("is ragged-right by default on a phone, and justifies it on a toggle", () => {
    onPhone(true)
    const service = TestBed.inject(TextAlignService)
    expect(service.ragged).toBe(true)

    service.toggle()
    expect(service.ragged).toBe(false)
    expect(classes.contains("justified-text")).toBe(true)
    expect(localStorage.getItem("raggedText")).toBe("false")
  })

  // At about 235 % the text was ragged-right (large-text) but the menus said
  // Justificado, and the first click stored "ragged": nothing changed.
  it("is ragged-right by default at the largest text sizes, and justifies it on a toggle", () => {
    onPhone(false)
    const reader = document.createElement("div")
    reader.className = "text-container large-text"
    document.body.append(reader)
    try {
      const service = TestBed.inject(TextAlignService)
      expect(service.ragged).toBe(true)

      service.toggle()
      expect(service.ragged).toBe(false)
      expect(classes.contains("justified-text")).toBe(true)

      // Back at a normal size, the choice still holds.
      reader.classList.remove("large-text")
      expect(service.ragged).toBe(false)
    } finally {
      reader.remove()
    }
  })

  it("sets the text ragged-right and remembers it", () => {
    onPhone(false)
    TestBed.inject(TextAlignService).toggle()
    expect(classes.contains("ragged-text")).toBe(true)
    expect(localStorage.getItem("raggedText")).toBe("true")

    // Next launch.
    classes.remove("ragged-text")
    TestBed.resetTestingModule()
    expect(TestBed.inject(TextAlignService).ragged).toBe(true)
    expect(classes.contains("ragged-text")).toBe(true)
  })

  it("keeps a choice whatever the screen's default", () => {
    onPhone(true)
    localStorage.setItem("raggedText", "false")
    expect(TestBed.inject(TextAlignService).ragged).toBe(false)
    expect(classes.contains("justified-text")).toBe(true)
  })

  it("justifies again on a second toggle", () => {
    onPhone(false)
    const service = TestBed.inject(TextAlignService)
    service.toggle()
    service.toggle()
    expect(service.ragged).toBe(false)
    expect(classes.contains("ragged-text")).toBe(false)
    expect(localStorage.getItem("raggedText")).toBe("false")
  })
})
