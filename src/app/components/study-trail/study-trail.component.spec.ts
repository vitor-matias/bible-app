import { type ComponentFixture, TestBed } from "@angular/core/testing"
import { provideRouter } from "@angular/router"
import type { TrailEntry } from "../../services/reading-trail.service"
import { StudyTrailComponent } from "./study-trail.component"

function entry(label: string, key = label): TrailEntry {
  return { key, label, link: ["/", "mt", 22] }
}

describe("StudyTrailComponent", () => {
  let component: StudyTrailComponent
  let fixture: ComponentFixture<StudyTrailComponent>

  function setEntries(entries: TrailEntry[]): void {
    fixture.componentRef.setInput("entries", entries)
    fixture.detectChanges()
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [StudyTrailComponent],
      providers: [provideRouter([])],
    }).compileComponents()

    fixture = TestBed.createComponent(StudyTrailComponent)
    component = fixture.componentInstance
  })

  it("names where the reader is before there is any way back", () => {
    setEntries([entry("Mateus 22")])

    expect(component.hasTrail).toBeFalse()
    // The heading is the point of the row even with nowhere to go back to;
    // what it has nothing to offer yet is a way to clear the trail.
    const current = fixture.nativeElement.querySelector(".trail-current")
    expect(current.tagName).toBe("H1")
    expect(current.textContent.trim()).toBe("Mateus 22")
    expect(fixture.nativeElement.querySelector(".trail-link")).toBeNull()
    expect(fixture.nativeElement.querySelector(".trail-clear")).toBeNull()
  })

  it("shows nothing at all before the reader has arrived anywhere", () => {
    setEntries([])

    expect(fixture.nativeElement.querySelector(".study-trail")).toBeNull()
  })

  it("lists the way back once the reader has travelled", () => {
    setEntries([entry("Mateus 22"), entry("Lucas 14"), entry("Marcos 12")])

    const labels = Array.from(
      fixture.nativeElement.querySelectorAll(".trail-item"),
    ).map((item) => (item as HTMLElement).textContent?.trim().split(/\s*›/)[0])
    expect(labels).toEqual(["Mateus 22", "Lucas 14", "Marcos 12"])
  })

  it("links every step except the one the reader is on", () => {
    setEntries([entry("Mateus 22"), entry("Lucas 14"), entry("Marcos 12")])

    expect(fixture.nativeElement.querySelectorAll(".trail-link").length).toBe(2)
    const current = fixture.nativeElement.querySelector(".trail-current")
    expect(current.textContent.trim()).toBe("Marcos 12")
    expect(current.getAttribute("aria-current")).toBe("page")
  })

  it("offers a way to start the trail again", () => {
    setEntries([entry("Mateus 22"), entry("Lucas 14")])
    let asked = 0
    component.clearTrail.subscribe(() => asked++)

    fixture.nativeElement
      .querySelector(".trail-clear")
      .dispatchEvent(new MouseEvent("click"))

    expect(asked).toBe(1)
  })

  it("scrolls forward to the step the reader is on", () => {
    setEntries([entry("Mateus 22"), entry("Lucas 14")])
    const list = fixture.nativeElement.querySelector(".trail-list")
    const scrollTo = spyOn(list, "scrollTo")

    setEntries([entry("Mateus 22"), entry("Lucas 14"), entry("Marcos 12")])

    expect(scrollTo).toHaveBeenCalled()
    const [options] = scrollTo.calls.mostRecent().args as [ScrollToOptions]
    expect(options.left).toBe(list.scrollWidth)
  })

  it("leaves the list alone where the DOM cannot scroll", () => {
    setEntries([entry("Mateus 22")])
    const list = fixture.nativeElement.querySelector(".trail-list")
    // The app is prerendered against domino, which has no Element.scrollTo.
    ;(list as { scrollTo?: unknown }).scrollTo = undefined

    expect(() =>
      setEntries([entry("Mateus 22"), entry("Lucas 14")]),
    ).not.toThrow()
  })

  it("carries each step's verse through to its link", () => {
    setEntries([
      { ...entry("Mateus 22"), queryParams: { verseStart: 39 } },
      entry("Lucas 14"),
    ])

    expect(
      fixture.nativeElement.querySelector(".trail-link").getAttribute("href"),
    ).toBe("/mt/22?verseStart=39")
  })
})
