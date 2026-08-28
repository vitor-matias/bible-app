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

  it("stays out of the way until there is somewhere to go back to", () => {
    setEntries([entry("Mateus 22")])

    expect(component.hasTrail).toBeFalse()
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
