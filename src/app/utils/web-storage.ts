const PROBE_KEY = "__bibleAppStorageProbe__"

/**
 * Returns the candidate only if a probe write reads back: a Storage can exist
 * yet throw on writes (quota, policy) or silently drop them (privacy modes).
 * A missing or stubbed candidate throws into the same catch.
 */
export function pickUsableStorage(
  candidate: Storage | undefined,
): Storage | null {
  try {
    if (!candidate) return null
    candidate.setItem(PROBE_KEY, PROBE_KEY)
    try {
      return candidate.getItem(PROBE_KEY) === PROBE_KEY ? candidate : null
    } finally {
      // Remove the probe even when the read-back throws.
      candidate.removeItem(PROBE_KEY)
    }
  } catch {
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
