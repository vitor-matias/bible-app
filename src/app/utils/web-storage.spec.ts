import { pickUsableStorage, safeLocalStorage } from "./web-storage"

describe("web-storage", () => {
  describe("pickUsableStorage", () => {
    it("returns null for a missing candidate", () => {
      expect(pickUsableStorage(undefined)).toBeNull()
    })

    it("returns null when methods are not callable (Node worker localStorage stub)", () => {
      expect(pickUsableStorage({} as Storage)).toBeNull()
      expect(
        pickUsableStorage({
          getItem: "nope",
          setItem: () => {},
        } as unknown as Storage),
      ).toBeNull()
      expect(
        pickUsableStorage({ getItem: () => null } as unknown as Storage),
      ).toBeNull()
    })

    // Present-but-unwritable is the case callers cannot defend against on
    // their own: every `safeLocalStorage()?.setItem(...)` would throw.
    it("returns null when writing throws (quota, storage disabled)", () => {
      expect(
        pickUsableStorage({
          getItem: () => null,
          setItem: () => {
            throw new Error("QuotaExceededError")
          },
          removeItem: () => {},
        } as unknown as Storage),
      ).toBeNull()
    })

    it("cleans up after its write probe", () => {
      pickUsableStorage(window.localStorage)
      const leftovers = Object.keys(window.localStorage).filter((key) =>
        key.startsWith("__bibleAppStorageProbe__"),
      )
      expect(leftovers).toEqual([])
    })

    // A write-only probe passes here, and every preference the app saves is
    // then silently discarded.
    it("returns null when writes are silently dropped", () => {
      expect(
        pickUsableStorage({
          getItem: () => null,
          setItem: () => {},
          removeItem: () => {},
        } as unknown as Storage),
      ).toBeNull()
    })

    it("returns null when reading back throws", () => {
      expect(
        pickUsableStorage({
          getItem: () => {
            throw new Error("denied")
          },
          setItem: () => {},
          removeItem: () => {},
        } as unknown as Storage),
      ).toBeNull()
    })

    // A fixed probe key would overwrite whatever the origin already had there.
    it("leaves an existing value under the legacy probe key alone", () => {
      window.localStorage.setItem("__bibleAppStorageProbe__", "keep me")
      try {
        expect(pickUsableStorage(window.localStorage)).toBe(window.localStorage)
        expect(window.localStorage.getItem("__bibleAppStorageProbe__")).toBe(
          "keep me",
        )
      } finally {
        window.localStorage.removeItem("__bibleAppStorageProbe__")
      }
    })

    it("returns null when property access throws (privacy modes)", () => {
      const throwing = new Proxy({} as Storage, {
        get() {
          throw new Error("denied")
        },
      })
      expect(pickUsableStorage(throwing)).toBeNull()
    })

    it("returns a functional storage as-is", () => {
      expect(pickUsableStorage(window.localStorage)).toBe(window.localStorage)
    })
  })

  describe("safeLocalStorage", () => {
    it("returns the real localStorage in the browser", () => {
      expect(safeLocalStorage()).toBe(window.localStorage)
    })
  })
})
