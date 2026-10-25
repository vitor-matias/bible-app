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
    expect(service.ragged).toBeFalse()
    expect(classes.contains("ragged-text")).toBeFalse()
  })

  it("sets the text ragged-right and remembers it", () => {
    TestBed.inject(TextAlignService).toggle()
    expect(classes.contains("ragged-text")).toBeTrue()
    expect(localStorage.getItem("raggedText")).toBe("true")

    // Next launch.
    classes.remove("ragged-text")
    TestBed.resetTestingModule()
    expect(TestBed.inject(TextAlignService).ragged).toBeTrue()
    expect(classes.contains("ragged-text")).toBeTrue()
  })

  it("justifies again on a second toggle", () => {
    const service = TestBed.inject(TextAlignService)
    service.toggle()
    service.toggle()
    expect(service.ragged).toBeFalse()
    expect(classes.contains("ragged-text")).toBeFalse()
    expect(localStorage.getItem("raggedText")).toBe("false")
  })
})
