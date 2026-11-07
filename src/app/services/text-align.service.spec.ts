import { TestBed } from "@angular/core/testing"
import { TextAlignService } from "./text-align.service"

describe("TextAlignService", () => {
  const classes = document.documentElement.classList

  beforeEach(() => {
    localStorage.removeItem("raggedText")
    classes.remove("ragged-text")
    TestBed.resetTestingModule()
  })

  afterEach(() => {
    localStorage.removeItem("raggedText")
    classes.remove("ragged-text")
  })

  it("justifies the text by default", () => {
    const service = TestBed.inject(TextAlignService)
    expect(service.ragged).toBe(false)
    expect(classes.contains("ragged-text")).toBe(false)
  })

  it("sets the text ragged-right and remembers it", () => {
    TestBed.inject(TextAlignService).toggle()
    expect(classes.contains("ragged-text")).toBe(true)
    expect(localStorage.getItem("raggedText")).toBe("true")

    // Next launch.
    classes.remove("ragged-text")
    TestBed.resetTestingModule()
    expect(TestBed.inject(TextAlignService).ragged).toBe(true)
    expect(classes.contains("ragged-text")).toBe(true)
  })

  it("justifies again on a second toggle", () => {
    const service = TestBed.inject(TextAlignService)
    service.toggle()
    service.toggle()
    expect(service.ragged).toBe(false)
    expect(classes.contains("ragged-text")).toBe(false)
    expect(localStorage.getItem("raggedText")).toBe("false")
  })
})
