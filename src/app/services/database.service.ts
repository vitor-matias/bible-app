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

    this.dbPromise = new Promise((resolve) => {
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

      request.onsuccess = () => {
        this.db = request.result
        resolve(this.db)
      }

      request.onerror = (event) => {
        console.error("IndexedDB error:", request.error)
        resolve(null)
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

  async put<T>(storeName: string, item: T): Promise<void> {
    const db = await this.getDB()
    if (!db) return

    return new Promise((resolve, reject) => {
      try {
        const transaction = db.transaction(storeName, "readwrite")
        const store = transaction.objectStore(storeName)
        store.put(item)

        transaction.oncomplete = () => resolve()
        transaction.onerror = () => reject(transaction.error)
      } catch (error) {
        reject(error)
      }
    })
  }

  async putAll<T>(storeName: string, items: T[]): Promise<void> {
    const db = await this.getDB()
    if (!db) return

    return new Promise((resolve, reject) => {
      try {
        const transaction = db.transaction(storeName, "readwrite")
        const store = transaction.objectStore(storeName)

        transaction.oncomplete = () => resolve()
        transaction.onerror = () => reject(transaction.error)

        for (const item of items) {
          store.put(item)
        }
      } catch (error) {
        reject(error)
      }
    })
  }

  async delete(
    storeName: string,
    key: IDBValidKey | IDBKeyRange,
  ): Promise<void> {
    const db = await this.getDB()
    if (!db) return

    return new Promise((resolve, reject) => {
      try {
        const transaction = db.transaction(storeName, "readwrite")
        const store = transaction.objectStore(storeName)
        store.delete(key)

        transaction.oncomplete = () => resolve()
        transaction.onerror = () => reject(transaction.error)
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
      } catch (error) {
        reject(error)
      }
    })
  }
}
