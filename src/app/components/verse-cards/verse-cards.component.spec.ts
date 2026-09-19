import { type ComponentFixture, TestBed } from "@angular/core/testing"
import { provideRouter } from "@angular/router"
import { of } from "rxjs"
import { BookService } from "../../services/book.service"
import { VerseCardsComponent } from "./verse-cards.component"

describe("VerseCardsComponent", () => {
  let fixture: ComponentFixture<VerseCardsComponent>

  const john: Book = {
    id: "jhn",
    name: "Evangelho segundo São João",
    shortName: "João",
    abrv: "Jo",
    chapterCount: 21,
  }

  const text = (value: string): TextType => ({
    type: "text",
    text: value,
    normalizedText: value,
  })

  function verse(number: number, ...elements: TextType[]): Verse {
    return {
      bookId: john.id,
      chapterNumber: 3,
      number,
      verseLabel: `${number}`,
      text: elements,
    }
  }

  const chapter: Chapter = {
    bookId: john.id,
    number: 3,
    verses: [
      verse(0, {
        type: "section",
        tag: "s2",
        text: "Diálogo com Nicodemos",
        normalizedText: "",
      }),
      verse(1, text("Havia um homem chamado Nicodemos.")),
      verse(2, text("Veio ter com Jesus de noite.")),
    ],
  }

  function cards(): HTMLElement[] {
    return Array.from(fixture.nativeElement.querySelectorAll("article"))
  }

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        // <verse> links cross-references through the router.
        provideRouter([]),
        {
          provide: BookService,
          // The real <verse> renders the cards, and its reference parser
          // subscribes to the book list as soon as it is constructed.
          useValue: { books$: of([john]), getBooks: () => [john] },
        },
      ],
    })
    fixture = TestBed.createComponent(VerseCardsComponent)
    fixture.componentRef.setInput("chapter", chapter)
    fixture.detectChanges()
  })

  it("shows exactly one verse on each card, in chapter order", () => {
    expect(cards().length).toBe(2)
    for (const card of cards()) {
      expect(card.querySelectorAll("verse").length).toBe(1)
    }
    expect(cards()[0].textContent).toContain(
      "Havia um homem chamado Nicodemos.",
    )
    expect(cards()[1].textContent).toContain("Veio ter com Jesus de noite.")
  })

  it("puts nothing on a card but the verse", () => {
    // No section heading, no book reference, no buttons: just the verse number
    // and its words.
    expect(cards()[1].textContent?.trim()).toBe("2Veio ter com Jesus de noite.")
    expect(fixture.nativeElement.textContent).not.toContain(
      "Diálogo com Nicodemos",
    )
    expect(fixture.nativeElement.textContent).not.toContain("João")
    expect(fixture.nativeElement.querySelector("button, a")).toBeNull()
  })

  it("gives each verse the id a deep link scrolls to", () => {
    // ?verseStart=2 is resolved by the reader with [id="2"], in every view.
    expect(cards()[1].querySelector("verse")?.getAttribute("id")).toBe("2")
  })

  it("names each card for assistive tech without putting the name on screen", () => {
    expect(cards()[1].getAttribute("aria-label")).toBe("Versículo 2")
  })

  // The reader's scroller supplies "scroll-snap-type: y mandatory"; these are
  // the card's half of the contract.
  it("makes each card a stop the scroller cannot fly past: one swipe, one verse", () => {
    const style = getComputedStyle(cards()[0])

    expect(style.scrollSnapAlign).toBe("start")
    expect(style.scrollSnapStop).toBe("always")
  })

  it("fades each verse with the scroll position rather than with script", () => {
    const style = getComputedStyle(cards()[0])

    // Angular scopes the keyframes name, hence toContain.
    expect(style.animationName).toContain("verse-card-fade")
    expect(style.animationTimeline).toContain("view")
  })

  it("deals out the new chapter when the reader moves on", () => {
    fixture.componentRef.setInput("chapter", {
      ...chapter,
      number: 4,
      verses: [{ ...verse(1, text("Quando Jesus soube.")), chapterNumber: 4 }],
    })
    fixture.detectChanges()

    expect(cards().length).toBe(1)
    expect(cards()[0].textContent).toContain("Quando Jesus soube.")
  })
})
