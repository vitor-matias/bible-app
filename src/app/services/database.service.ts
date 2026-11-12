import { Injectable } from "@angular/core"

@Injectable({
  providedIn: "root",
})
export class DatabaseService {
  private readonly DB_NAME = "offline-bible"
  private readonly DB_VERSION = 2 // Incremented to add bookmarks store
  private db: IDBDatabase | null = null
  private dbPromise: Promise<IDBDatabase | null> | null = null

  private async getDB(): Promise<IDBDatabase | null> {
    if (this.db) return this.db
    if (this.dbPromise) return this.dbPromise

    this.dbPromise = new Promise((resolve, reject) => {
      if (typeof indexedDB === "undefined") {
        resolve(null)
        return
      }

      const request = indexedDB.open(this.DB_NAME, this.DB_VERSION)

      request.onupgradeneeded = (event) => {
        const db = request.result
        // Migration from version 1 to 2
        if (!db.objectStoreNames.contains("books")) {
          db.createObjectStore("books", { keyPath: "id" })
        }
        if (!db.objectStoreNames.contains("bookmarks")) {
          // Use a composite key or a unique path.
          // For bookmarks, we can use a combination of bookId and chapter, or just a unique id.
          // The current Bookmark interface doesn't have a unique ID, but bookId+chapter is unique per bookmark in this app's context.
          db.createObjectStore("bookmarks", { keyPath: ["bookId", "chapter"] })
        }
      }

      request.onblocked = () => {
        console.warn("IndexedDB upgrade blocked. Close other tabs to continue.")
        reject(new Error("IndexedDB upgrade blocked"))
      }

      request.onsuccess = () => {
        this.db = request.result
        this.db.onversionchange = () => {
          this.db?.close()
          this.db = null
        }
        this.db.onclose = () => {
          this.db = null
        }
        resolve(this.db)
        this.dbPromise = null
      }

      request.onerror = (event) => {
        if (request.error) {
          console.error("IndexedDB error:", request.error)
        }
        this.dbPromise = null
        reject(request.error || new Error("Unknown IndexedDB error"))
      }
    })

    return this.dbPromise
  }

  async getAll<T>(storeName: string): Promise<T[]> {
    const db = await this.getDB()
    if (!db) return []

    return new Promise((resolve, reject) => {
      try {
        const transaction = db.transaction(storeName, "readonly")
        const store = transaction.objectStore(storeName)
        const request = store.getAll()

        request.onsuccess = () => resolve(request.result as T[])
        request.onerror = () => reject(request.error)
      } catch (error) {
        reject(error)
      }
    })
  }

  async clear(storeName: string): Promise<void> {
    const db = await this.getDB()
    if (!db) return

    return new Promise((resolve, reject) => {
      try {
        const transaction = db.transaction(storeName, "readwrite")
        const store = transaction.objectStore(storeName)
        store.clear()

        transaction.oncomplete = () => resolve()
        transaction.onerror = () => reject(transaction.error)
        transaction.onabort = () => reject(transaction.error)
      } catch (error) {
        reject(error)
      }
    })
  }

  async clearAndPutAll<T>(storeName: string, items: T[]): Promise<void> {
    const db = await this.getDB()
    if (!db) return

    return new Promise((resolve, reject) => {
      try {
        const transaction = db.transaction(storeName, "readwrite")
        const store = transaction.objectStore(storeName)

        transaction.oncomplete = () => resolve()
        transaction.onerror = () => reject(transaction.error)
        // A full disk ("QuotaExceededError") arrives only as an abort.
        transaction.onabort = () => reject(transaction.error)

        // Clear existing data
        store.clear()

        // Put new data
        for (const item of items) {
          const putRequest = store.put(item)
          putRequest.onerror = () => {
            transaction.abort()
            reject(putRequest.error)
          }
        }
      } catch (error) {
        reject(error)
      }
    })
  }

  /** In one transaction, deletes and then puts: a put may reuse a deleted key. */
  /**
   * Reads the store and writes what `change` makes of its records, in one
   * transaction, so what another tab wrote meanwhile is kept. `change` returns
   * the new records, reusing the objects it keeps; only the others are
   * deleted or put. Resolves to the new records, or null without IndexedDB.
   */
  async update<T>(
    storeName: string,
    keyOf: (item: T) => IDBValidKey,
    change: (items: T[]) => T[],
  ): Promise<T[] | null> {
    const db = await this.getDB()
    if (!db) return null

    return new Promise((resolve, reject) => {
      try {
        const transaction = db.transaction(storeName, "readwrite")
        const store = transaction.objectStore(storeName)
        let updated: T[] = []

        transaction.oncomplete = () => resolve(updated)
        transaction.onerror = () => reject(transaction.error)
        // A full disk ("QuotaExceededError") arrives only as an abort.
        transaction.onabort = () => reject(transaction.error)

        const read = store.getAll()
        read.onsuccess = () => {
          try {
            const items = read.result as T[]
            updated = change(items)
            // Deletes first: a put may reuse a deleted key.
            for (const item of items) {
              if (!updated.includes(item)) store.delete(keyOf(item))
            }
            for (const item of updated) {
              if (!items.includes(item)) store.put(item)
            }
          } catch (error) {
            transaction.abort()
            reject(error)
          }
        }
      } catch (error) {
        reject(error)
      }
    })
  }
}
