import { endOfBookLabel, toVerseCards } from "./verse-cards"

const text = (value: string): TextType => ({
  type: "text",
  text: value,
})
const paragraph = (): TextType => ({
  type: "paragraph",
  text: "\n",
})
const section = (value: string, tag = "s2"): TextType => ({
  type: "section",
  tag,
  text: value,
})
const references = (value: string): TextType => ({
  type: "references",
  text: value,
})
const footnote = (value: string): TextType => ({
  type: "footnote",
  text: value,
  reference: "",
})

function verse(number: number, ...elements: TextType[]): Verse {
  return {
    bookId: "jhn",
    chapterNumber: 3,
    number,
    verseLabel: `${number}`,
    text: elements,
  }
}

function chapter(...verses: Verse[]): Chapter {
  return { bookId: "jhn", number: 3, verses }
}

describe("toVerseCards", () => {
  it("deals the chapter out one verse to a card, in order", () => {
    const cards = toVerseCards(
      chapter(
        verse(1, text("Primeiro.")),
        verse(2, text("Segundo.")),
        verse(3, text("Terceiro.")),
      ),
    )

    expect(cards.map((card) => card.number)).toEqual([1, 2, 3])
    expect(cards.map((card) => card.text)).toEqual([
      [text("Primeiro.")],
      [text("Segundo.")],
      [text("Terceiro.")],
    ])
  })

  it("never puts two verses on a card, however short they are", () => {
    expect(
      toVerseCards(chapter(verse(1, text("Sim.")), verse(2, text("Não."))))
        .length,
    ).toBe(2)
  })

  it("leaves pericope headings out, with the references that belong to them", () => {
    const cards = toVerseCards(
      chapter(
        verse(0, section("Parte", "ms"), section("Diálogo com Nicodemos")),
        verse(1, text("Havia um homem.")),
        // The edition hangs the NEXT pericope's heading on the end of this
        // verse, where it would read as part of it.
        verse(
          2,
          text("Veio de noite."),
          section("A seguinte"),
          references("(Lc 6,20-26)"),
          paragraph(),
        ),
        verse(3, text("Depois disto.")),
      ),
    )

    expect(cards.map((card) => card.text)).toEqual([
      [text("Havia um homem.")],
      [text("Veio de noite.")],
      [text("Depois disto.")],
    ])
  })

  it("keeps the verse's own cross-references", () => {
    const cards = toVerseCards(
      chapter(verse(1, text("Como está escrito."), references("(Is 40,3)"))),
    )

    expect(cards[0].text).toEqual([
      text("Como está escrito."),
      references("(Is 40,3)"),
    ])
  })

  it("keeps a verse whole when a heading falls in the middle of it, losing no words", () => {
    // Gn 2,4: the first half closes one account, the second opens the next.
    const cards = toVerseCards(
      chapter(
        verse(
          4,
          footnote("nota"),
          text("Esta é a origem."),
          section("O homem"),
          references("(1,26-29)"),
          paragraph(),
          text("Quando o Senhor fez a Terra"),
        ),
      ),
    )

    // One card still, with a break where the heading stood.
    expect(cards.length).toBe(1)
    expect(cards[0].text).toEqual([
      text("Esta é a origem."),
      paragraph(),
      text("Quando o Senhor fez a Terra"),
    ])
  })

  it("reads text the edition keeps in verse 0", () => {
    // Esther's Greek additions and the acrostic letters of Ps 119 live there.
    const cards = toVerseCards(
      chapter(
        verse(
          0,
          section("Um sonho de Mardoqueu"),
          paragraph(),
          text("No ano."),
        ),
        verse(1, text("No tempo de Assuero.")),
      ),
    )

    expect(cards.map((card) => card.number)).toEqual([0, 1])
    // Without the break the heading left in front of it.
    expect(cards[0].text).toEqual([text("No ano.")])
  })

  it("leaves footnotes out, so the card has no marker and nothing to tap", () => {
    const cards = toVerseCards(
      chapter(
        verse(
          16,
          footnote("Nota sobre o amor de Deus."),
          text("Deus amou de tal modo o mundo"),
          footnote("Outra nota."),
          text(" que lhe deu o seu Filho."),
        ),
      ),
    )

    expect(cards[0].text).toEqual([
      text("Deus amou de tal modo o mundo"),
      text(" que lhe deu o seu Filho."),
    ])
  })

  it("does not take a heading's references for the verse's own because a note sits between them", () => {
    const cards = toVerseCards(
      chapter(
        verse(
          2,
          text("Veio de noite."),
          section("A seguinte"),
          footnote("nota"),
          references("(Lc 6,20-26)"),
        ),
      ),
    )

    expect(cards[0].text).toEqual([text("Veio de noite.")])
  })

  it("keeps breaks inside a verse, dropping the ones at its edges", () => {
    const cards = toVerseCards(
      chapter(
        verse(
          1,
          footnote("nota"),
          paragraph(),
          text("Salmo de David."),
          paragraph(),
          text("O Senhor é meu pastor."),
          paragraph(),
        ),
      ),
    )

    expect(cards[0].text).toEqual([
      text("Salmo de David."),
      paragraph(),
      text("O Senhor é meu pastor."),
    ])
  })

  it("does not mutate the chapter it cuts from", () => {
    const original = verse(
      1,
      text("Texto."),
      section("A seguinte"),
      paragraph(),
    )

    toVerseCards(chapter(original))

    expect(original.text.length).toBe(3)
  })

  it("skips verses that only carry a zero-width space", () => {
    const blankQuote: TextType = {
      type: "quote",
      text: String.fromCharCode(0x200b),
      identLevel: 1,
    }
    const cards = toVerseCards(
      chapter(verse(1, blankQuote), verse(2, blankQuote, text("Texto."))),
    )

    expect(cards.map((card) => card.number)).toEqual([2])
  })

  it("returns no cards for a chapter with nothing to read", () => {
    expect(toVerseCards(chapter())).toEqual([])
    expect(toVerseCards(chapter(verse(0, section("Só título"))))).toEqual([])
    expect(toVerseCards({ bookId: "jhn", number: 3 })).toEqual([])
  })
})

describe("endOfBookLabel", () => {
  const named = (name: string): Book => ({
    id: "x",
    name,
    shortName: name,
    abrv: "x",
    chapterCount: 1,
  })

  it("closes a book in the masculine", () => {
    expect(endOfBookLabel(named("Livro do Génesis"))).toBe(
      "Fim do Livro do Génesis",
    )
    expect(endOfBookLabel(named("Evangelho segundo São João"))).toBe(
      "Fim do Evangelho segundo São João",
    )
    expect(endOfBookLabel(named("Segundo Livro dos Reis"))).toBe(
      "Fim do Segundo Livro dos Reis",
    )
    expect(endOfBookLabel(named("Cântico dos Cânticos"))).toBe(
      "Fim do Cântico dos Cânticos",
    )
  })

  it("closes a letter in the feminine", () => {
    expect(endOfBookLabel(named("Carta aos Romanos"))).toBe(
      "Fim da Carta aos Romanos",
    )
    expect(endOfBookLabel(named("Primeira Carta aos Coríntios"))).toBe(
      "Fim da Primeira Carta aos Coríntios",
    )
    expect(endOfBookLabel(named("Terceira Carta de João"))).toBe(
      "Fim da Terceira Carta de João",
    )
  })
})
