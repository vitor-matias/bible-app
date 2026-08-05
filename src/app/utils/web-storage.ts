/**
 * Returns a Storage candidate only when it is actually usable.
 * A bare `typeof localStorage === "undefined"` check is not enough: newer
 * Node versions (used by prerendering workers) define a localStorage global
 * whose methods are not callable unless the process sets --localstorage-file.
 */
export function pickUsableStorage(
  candidate: Storage | undefined,
): Storage | null {
  try {
    if (
      !candidate ||
      typeof candidate.getItem !== "function" ||
      typeof candidate.setItem !== "function"
    ) {
      return null
    }
    return candidate
  } catch {
    // Some privacy modes throw on any Storage access.
    return null
  }
}

/** The global localStorage, or null wherever it is missing or non-functional. */
export function safeLocalStorage(): Storage | null {
  try {
    return pickUsableStorage(
      typeof localStorage === "undefined" ? undefined : localStorage,
    )
  } catch {
    return null
  }
}
