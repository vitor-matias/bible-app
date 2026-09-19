let probeCounter = 0

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
    // Unique per call, so the probe never overwrites or removes a stored value.
    probeCounter += 1
    const probeKey = `__bibleAppStorageProbe__${probeCounter}`
    candidate.setItem(probeKey, probeKey)
    try {
      return candidate.getItem(probeKey) === probeKey ? candidate : null
    } finally {
      // Remove the probe even when the read-back throws.
      candidate.removeItem(probeKey)
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
