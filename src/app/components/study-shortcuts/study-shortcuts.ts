/**
 * Study mode's keyboard, in one place: the reader acts on these keys and the
 * help lists them, and two lists would drift into a help that lies.
 *
 * Letters rather than brackets or function keys. On a Portuguese keyboard
 * "[" and "]" are behind AltGr, which arrives as Ctrl+Alt and would have to be
 * let through for them alone; every key here is one press, or Shift and one.
 */
export type StudyShortcutAction =
  | "nextVerse"
  | "previousVerse"
  | "note"
  | "search"
  | "tab1"
  | "tab2"
  | "tab3"
  | "tab4"
  | "toggleRail"
  | "togglePanel"
  | "help"

export type StudyShortcut = {
  /** `KeyboardEvent.key`, which is what the reader's layout makes of a press. */
  keys: string[]
  /** How the help shows them, when that is not the keys themselves. */
  shown?: string[]
  does: string
  /** Null for keys the reader already handles, listed for the help's sake. */
  action: StudyShortcutAction | null
}

export const STUDY_SHORTCUTS: StudyShortcut[] = [
  { keys: ["j"], does: "Versículo seguinte", action: "nextVerse" },
  { keys: ["k"], does: "Versículo anterior", action: "previousVerse" },
  {
    keys: ["Escape"],
    shown: ["Esc"],
    does: "Sair da caixa de texto; largar o versículo",
    action: null,
  },
  {
    keys: ["ArrowLeft", "ArrowRight"],
    shown: ["←", "→"],
    does: "Capítulo anterior e seguinte",
    action: null,
  },
  { keys: ["n"], does: "Escrever uma nota no versículo", action: "note" },
  { keys: ["/"], does: "Pesquisar na Bíblia", action: "search" },
  { keys: ["1"], does: "Referências", action: "tab1" },
  { keys: ["2"], does: "Notas de rodapé", action: "tab2" },
  { keys: ["3"], does: "As minhas notas", action: "tab3" },
  { keys: ["4"], does: "Pesquisar", action: "tab4" },
  { keys: ["l"], does: "Esconder ou mostrar os livros", action: "toggleRail" },
  { keys: ["p"], does: "Esconder ou mostrar o painel", action: "togglePanel" },
  { keys: ["?"], does: "Estes atalhos", action: "help" },
]

/** The action a key press asks for, if it asks for one. */
export function studyShortcutFor(
  event: KeyboardEvent,
): StudyShortcutAction | null {
  // With Ctrl, Alt or Cmd held the key belongs to the browser or the system.
  // Shift is let through: it is how "/" and "?" are typed on many layouts.
  if (event.ctrlKey || event.altKey || event.metaKey) return null
  const key = event.key.length === 1 ? event.key.toLowerCase() : event.key
  return (
    STUDY_SHORTCUTS.find((shortcut) => shortcut.keys.includes(key))?.action ??
    null
  )
}
