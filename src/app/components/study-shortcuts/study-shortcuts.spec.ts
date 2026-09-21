import { STUDY_SHORTCUTS, studyShortcutFor } from "./study-shortcuts"

const press = (key: string, init: KeyboardEventInit = {}) =>
  new KeyboardEvent("keydown", { key, ...init })

describe("study mode's shortcuts", () => {
  it("reads a plain key as what it asks for", () => {
    expect(studyShortcutFor(press("j"))).toBe("nextVerse")
    expect(studyShortcutFor(press("k"))).toBe("previousVerse")
    expect(studyShortcutFor(press("3"))).toBe("tab3")
  })

  it("lets Shift through, which is how / and ? are typed on many layouts", () => {
    // Shift+7 and Shift+' on a Portuguese keyboard.
    expect(studyShortcutFor(press("/", { shiftKey: true }))).toBe("search")
    expect(studyShortcutFor(press("?", { shiftKey: true }))).toBe("help")
    // Caps Lock, or a held Shift, is still the same key.
    expect(studyShortcutFor(press("J", { shiftKey: true }))).toBe("nextVerse")
  })

  it("leaves a key held with Ctrl, Alt or Cmd to the browser", () => {
    // Ctrl+L is the address bar, Cmd+P is print, and AltGr arrives as both.
    expect(studyShortcutFor(press("l", { ctrlKey: true }))).toBeNull()
    expect(studyShortcutFor(press("p", { metaKey: true }))).toBeNull()
    expect(
      studyShortcutFor(press("n", { ctrlKey: true, altKey: true })),
    ).toBeNull()
  })

  it("has no use for a key it does not list, nor for the ones it only lists", () => {
    expect(studyShortcutFor(press("x"))).toBeNull()
    // Listed for the help; the reader already handles them itself.
    expect(studyShortcutFor(press("Escape"))).toBeNull()
    expect(studyShortcutFor(press("ArrowRight"))).toBeNull()
  })

  it("gives no key two jobs", () => {
    const keys = STUDY_SHORTCUTS.flatMap((shortcut) => shortcut.keys)
    expect(new Set(keys).size).toBe(keys.length)
  })
})
