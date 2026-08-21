const PROBE_KEY = "__bibleAppStorageProbe__"

/**
 * Returns a Storage candidate only when it is actually usable.
 * Existence is not usability: a browser can expose a localStorage whose reads
 * work but whose writes throw (exhausted quota, storage disabled by policy),
 * and property access alone can throw where a privacy mode blocks the object
 * outright. So this probes with a real write it cleans up again, and callers
 * get null rather than an object that throws on the next `setItem`.
 */
export function pickUsableStorage(
  candidate: Storage | undefined,
): Storage | null {
  try {
    if (
      !candidate ||
      typeof candidate.getItem !== "function" ||
      typeof candidate.setItem !== "function" ||
      typeof candidate.removeItem !== "function"
    ) {
      return null
    }
    candidate.setItem(PROBE_KEY, PROBE_KEY)
    candidate.removeItem(PROBE_KEY)
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
