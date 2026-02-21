import { TestBed } from "@angular/core/testing"
import { DatabaseService } from "./database.service"

describe("DatabaseService", () => {
  let service: DatabaseService
  let mockIndexedDB: { open: jasmine.Spy }
  let mockIDBDatabase: {
    transaction: jasmine.Spy
    objectStoreNames: { contains: jasmine.Spy }
    createObjectStore: jasmine.Spy
  }
  let mockIDBTransaction: {
    objectStore: jasmine.Spy
    oncomplete: () => void
    onerror: () => void
    error: Error | null
  }
  let mockIDBObjectStore: {
    getAll: jasmine.Spy
    put: jasmine.Spy
    delete: jasmine.Spy
    clear: jasmine.Spy
  }
  let mockIDBRequest: {
    result: unknown
    onupgradeneeded: (event: unknown) => void
    onsuccess: () => void
    onerror: (event?: unknown) => void
    error: Error | null
  }

  beforeEach(() => {
    // Reset mocks for each test
    mockIDBObjectStore = jasmine.createSpyObj("IDBObjectStore", [
      "getAll",
      "put",
      "delete",
      "clear",
    ])

    mockIDBTransaction = {
      objectStore: jasmine
        .createSpy("objectStore")
        .and.returnValue(mockIDBObjectStore),
      oncomplete: null as unknown as () => void, // To be assigned by service
      onerror: null as unknown as () => void, // To be assigned by service
      error: null,
    }

    // Add transaction method which is used to create transactions
    mockIDBDatabase = {
      transaction: jasmine
        .createSpy("transaction")
        .and.returnValue(mockIDBTransaction),
      objectStoreNames: {
        contains: jasmine.createSpy("contains").and.returnValue(false),
      },
      createObjectStore: jasmine.createSpy("createObjectStore"),
    }

    mockIDBRequest = {
      result: mockIDBDatabase,
      onupgradeneeded: null as unknown as (event: unknown) => void,
      onsuccess: null as unknown as () => void,
      onerror: null as unknown as (event?: unknown) => void,
      error: null,
    }

    mockIndexedDB = {
      open: jasmine.createSpy("open").and.returnValue(mockIDBRequest),
    }

    // Mock global indexedDB
    try {
      spyOnProperty(window, "indexedDB", "get").and.returnValue(
        mockIndexedDB as unknown as IDBFactory,
      )
    } catch (_e) {
      ;(window as unknown as { indexedDB: unknown }).indexedDB = mockIndexedDB
    }

    TestBed.configureTestingModule({})
    service = TestBed.inject(DatabaseService)
  })

  it("should be created", () => {
    expect(service).toBeTruthy()
  })

  describe("getAll", () => {
    it("should retrieve all items from the store", async () => {
      const mockItems = [{ id: 1, name: "Item 1" }]
      const mockGetAllRequest = {
        result: mockItems,
        onsuccess: null as unknown as () => void,
        onerror: null as unknown as () => void,
      }
      mockIDBObjectStore.getAll.and.returnValue(mockGetAllRequest)

      // Start the call
      const promise = service.getAll("testStore")

      // Resolve DB open request
      expect(mockIndexedDB.open).toHaveBeenCalled()
      mockIDBRequest.onsuccess() // Resolve getDB()

      // Allow microtasks to process so that getDB() promise resolves and execution continues to transaction creation
      await new Promise((resolve) => setTimeout(resolve, 0))

      // Now transaction should have been created and getAll called
      expect(mockIDBDatabase.transaction).toHaveBeenCalledWith(
        "testStore",
        "readonly",
      )
      expect(mockIDBObjectStore.getAll).toHaveBeenCalled()

      // Resolve getAll request
      expect(mockGetAllRequest.onsuccess).toBeDefined()
      mockGetAllRequest.onsuccess()

      const items = await promise
      expect(items).toEqual(mockItems)
    })

    it("should return empty array if database fails to open", async () => {
      mockIDBRequest.onerror = null as unknown as (event?: unknown) => void // Prepare

      const promise = service.getAll("testStore")

      // Fail DB open
      const errorEvent = { target: { error: "DB Error" } }
      // Call onerror if it was assigned
      // Note: getDB assigns onerror.

      // We assume setup happened synchronously inside getDB before await
      expect(mockIDBRequest.onerror).toBeDefined()
      mockIDBRequest.onerror(errorEvent)

      const result = await promise
      expect(result).toEqual([])
    })

    it("should reject if transaction/request fails", async () => {
      const mockGetAllRequest = {
        result: null,
        onsuccess: null as unknown as () => void,
        onerror: null as unknown as () => void,
        error: new Error("GetAll failed"),
      }
      mockIDBObjectStore.getAll.and.returnValue(mockGetAllRequest)

      const promise = service.getAll("testStore")

      // Open DB
      mockIDBRequest.onsuccess()
      await new Promise((resolve) => setTimeout(resolve, 0))

      // Fail Request
      mockGetAllRequest.onerror()

      await expectAsync(promise).toBeRejectedWith(new Error("GetAll failed"))
    })
  })

  describe("put", () => {
    it("should put an item into the store", async () => {
      const item = { id: 1, val: "test" }

      const promise = service.put("testStore", item)

      // Open DB
      mockIDBRequest.onsuccess()
      await new Promise((resolve) => setTimeout(resolve, 0))

      expect(mockIDBDatabase.transaction).toHaveBeenCalledWith(
        "testStore",
        "readwrite",
      )
      expect(mockIDBObjectStore.put).toHaveBeenCalledWith(item)

      // Complete transaction
      expect(mockIDBTransaction.oncomplete).toBeDefined()
      mockIDBTransaction.oncomplete()

      await expectAsync(promise).toBeResolved()
    })

    it("should reject if put transaction fails", async () => {
      const item = { id: 1, val: "test" }
      const promise = service.put("testStore", item)

      // Open DB
      mockIDBRequest.onsuccess()
      await new Promise((resolve) => setTimeout(resolve, 0))

      // Fail transaction
      const error = new Error("Transaction Error")
      mockIDBTransaction.error = error
      expect(mockIDBTransaction.onerror).toBeDefined()
      mockIDBTransaction.onerror()

      await expectAsync(promise).toBeRejectedWith(error)
    })
  })

  describe("putAll", () => {
    it("should put multiple items", async () => {
      const items = [{ id: 1 }, { id: 2 }]
      const promise = service.putAll("testStore", items)

      // Open DB
      mockIDBRequest.onsuccess()
      await new Promise((resolve) => setTimeout(resolve, 0))

      expect(mockIDBDatabase.transaction).toHaveBeenCalledWith(
        "testStore",
        "readwrite",
      )
      expect(mockIDBObjectStore.put).toHaveBeenCalledTimes(2)
      expect(mockIDBObjectStore.put).toHaveBeenCalledWith(items[0])
      expect(mockIDBObjectStore.put).toHaveBeenCalledWith(items[1])

      mockIDBTransaction.oncomplete()
      await expectAsync(promise).toBeResolved()
    })
  })

  describe("delete", () => {
    it("should delete an item by key", async () => {
      const key = 1
      const promise = service.delete("testStore", key)

      // Open DB
      mockIDBRequest.onsuccess()
      await new Promise((resolve) => setTimeout(resolve, 0))

      expect(mockIDBDatabase.transaction).toHaveBeenCalledWith(
        "testStore",
        "readwrite",
      )
      expect(mockIDBObjectStore.delete).toHaveBeenCalledWith(key)

      mockIDBTransaction.oncomplete()
      await expectAsync(promise).toBeResolved()
    })
  })

  describe("clear", () => {
    it("should clear the store", async () => {
      const promise = service.clear("testStore")

      // Open DB
      mockIDBRequest.onsuccess()
      await new Promise((resolve) => setTimeout(resolve, 0))

      expect(mockIDBDatabase.transaction).toHaveBeenCalledWith(
        "testStore",
        "readwrite",
      )
      expect(mockIDBObjectStore.clear).toHaveBeenCalled()

      mockIDBTransaction.oncomplete()
      await expectAsync(promise).toBeResolved()
    })
  })

  describe("migrations", () => {
    it("should create object stores on upgrade needed", async () => {
      // Trigger getDB
      service.getAll("books") // fire and forget to trigger open

      expect(mockIndexedDB.open).toHaveBeenCalledWith("offline-bible", 2)

      const upgradeEvent = {}

      // Test upgrade logic
      mockIDBRequest.result = mockIDBDatabase

      // Case 1: stores don't exist
      mockIDBDatabase.objectStoreNames.contains.and.returnValue(false)

      mockIDBRequest.onupgradeneeded(upgradeEvent)

      expect(mockIDBDatabase.createObjectStore).toHaveBeenCalledWith("books", {
        keyPath: "id",
      })
      expect(mockIDBDatabase.createObjectStore).toHaveBeenCalledWith(
        "bookmarks",
        { keyPath: ["bookId", "chapter"] },
      )
    })

    it("should not create existing object stores", async () => {
      service.getAll("books")

      mockIDBRequest.result = mockIDBDatabase
      // Case 2: stores exist
      mockIDBDatabase.objectStoreNames.contains.and.returnValue(true)

      mockIDBRequest.onupgradeneeded({})

      expect(mockIDBDatabase.createObjectStore).not.toHaveBeenCalled()
    })
  })

  describe("IndexedDB Unavailable", () => {
    it("should return null DB if indexedDB is undefined", async () => {
      const propDesc = Object.getOwnPropertyDescriptor(window, "indexedDB")
      if (propDesc?.get) {
        ;(propDesc.get as jasmine.Spy).and.returnValue(undefined)
      } else {
        ;(window as unknown as { indexedDB: undefined }).indexedDB = undefined
      }

      const promise = service.getAll("books")
      const result = await promise
      expect(result).toEqual([])
    })
  })
})
