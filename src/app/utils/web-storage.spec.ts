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
      expect(window.localStorage.getItem("__bibleAppStorageProbe__")).toBeNull()
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
