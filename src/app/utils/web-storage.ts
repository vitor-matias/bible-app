let probeCounter = 0

/**
 * Returns a Storage candidate only when it is actually usable.
 * Existence is not usability: a browser can expose a localStorage whose reads
 * work but whose writes throw (exhausted quota, storage disabled by policy),
 * and property access alone can throw where a privacy mode blocks the object
 * outright. So this probes with a real write it reads back and cleans up, and
 * callers get null rather than an object that throws on the next `setItem`.
 *
 * The read-back matters: a storage that silently drops writes (some privacy
 * modes do exactly that) passes a write-only probe and then loses every
 * preference the app saves.
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
    // Unique per call so the probe can never overwrite a value the page
    // already holds under a fixed key.
    probeCounter += 1
    const probeKey = `__bibleAppStorageProbe__${probeCounter}`
    candidate.setItem(probeKey, probeKey)
    try {
      const readBack = candidate.getItem(probeKey)
      return readBack === probeKey ? candidate : null
    } finally {
      // Once the probe is written it has to come back out, including when the
      // read-back throws. Probe keys are unique per call, so leaving them
      // behind would accumulate junk in a storage that fails mid-probe. A
      // throw from here lands in the outer catch, like any other failure.
      candidate.removeItem(probeKey)
    }
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
