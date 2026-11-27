import { focusIfLost } from "./focus"

describe("focusIfLost", () => {
  let button: HTMLButtonElement
  let other: HTMLButtonElement

  beforeEach(() => {
    button = document.createElement("button")
    other = document.createElement("button")
    document.body.append(button, other)
  })

  afterEach(() => {
    button.remove()
    other.remove()
  })

  it("takes focus left on the page", () => {
    ;(document.activeElement as HTMLElement | null)?.blur()
    focusIfLost(button)
    expect(document.activeElement).toBe(button)
  })

  it("leaves focus the reader moved elsewhere", () => {
    other.focus()
    focusIfLost(button)
    expect(document.activeElement).toBe(other)
  })
})
