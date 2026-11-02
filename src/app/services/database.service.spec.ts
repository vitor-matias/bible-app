import type { Mock } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { DatabaseService } from './database.service';

describe('DatabaseService', () => {
  let service: DatabaseService;
  let mockIndexedDB: {
    open: Mock;
  };
  let mockIDBDatabase: {
    transaction: Mock;
    objectStoreNames: {
      contains: Mock;
    };
    createObjectStore: Mock;
    onversionchange: (() => void) | null;
    close: Mock | (() => void);
  };
  let mockIDBTransaction: {
    objectStore: Mock;
    oncomplete: () => void;
    onerror: () => void;
    onabort: () => void;
    error: Error | null;
  };
  let mockIDBObjectStore: {
    getAll: Mock;
    put: Mock;
    delete: Mock;
    clear: Mock;
  };
  let mockIDBRequest: {
    result: unknown;
    onupgradeneeded: (event: unknown) => void;
    onsuccess: () => void;
    onerror: (event?: unknown) => void;
    onblocked: () => void;
    error: Error | null;
  };

  beforeEach(() => {
    // Reset mocks for each test
    mockIDBObjectStore = {
      getAll: vi.fn().mockName('IDBObjectStore.getAll'),
      put: vi.fn().mockName('IDBObjectStore.put'),
      delete: vi.fn().mockName('IDBObjectStore.delete'),
      clear: vi.fn().mockName('IDBObjectStore.clear'),
    };

    mockIDBTransaction = {
      objectStore: vi
        .fn()
        .mockName('objectStore')
        .mockReturnValue(mockIDBObjectStore),
      oncomplete: null as unknown as () => void, // To be assigned by service
      onerror: null as unknown as () => void, // To be assigned by service
      onabort: null as unknown as () => void, // To be assigned by service
      error: null,
    };

    // Add transaction method which is used to create transactions
    mockIDBDatabase = {
      transaction: vi
        .fn()
        .mockName('transaction')
        .mockReturnValue(mockIDBTransaction),
      objectStoreNames: {
        contains: vi.fn().mockName('contains').mockReturnValue(false),
      },
      createObjectStore: vi.fn().mockName('createObjectStore'),
      onversionchange: null,
      close: vi.fn().mockName('close'),
    };

    mockIDBRequest = {
      result: mockIDBDatabase,
      onupgradeneeded: null as unknown as (event: unknown) => void,
      onsuccess: null as unknown as () => void,
      onerror: null as unknown as (event?: unknown) => void,
      onblocked: null as unknown as () => void,
      error: null,
    };

    mockIndexedDB = {
      open: vi.fn().mockName('open').mockReturnValue(mockIDBRequest),
    };

    // Mock global indexedDB
    try {
      vi.spyOn(window, 'indexedDB', 'get').mockReturnValue(
        mockIndexedDB as unknown as IDBFactory
      );
    } catch (_e) {
      (
        window as unknown as {
          indexedDB: unknown;
        }
      ).indexedDB = mockIndexedDB;
    }

    TestBed.configureTestingModule({});
    service = TestBed.inject(DatabaseService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('getAll', () => {
    it('should retrieve all items from the store', async () => {
      const mockItems = [{ id: 1, name: 'Item 1' }];
      const mockGetAllRequest = {
        result: mockItems,
        onsuccess: null as unknown as () => void,
        onerror: null as unknown as () => void,
      };
      mockIDBObjectStore.getAll.mockReturnValue(mockGetAllRequest);

      // Start the call
      const promise = service.getAll('testStore');

      // Resolve DB open request
      expect(mockIndexedDB.open).toHaveBeenCalled();
      mockIDBRequest.onsuccess(); // Resolve getDB()

      // Allow microtasks to process so that getDB() promise resolves and execution continues to transaction creation
      await new Promise((resolve) => setTimeout(resolve, 0));

      // Now transaction should have been created and getAll called
      expect(mockIDBDatabase.transaction).toHaveBeenCalledWith(
        'testStore',
        'readonly'
      );
      expect(mockIDBObjectStore.getAll).toHaveBeenCalled();

      // Resolve getAll request
      expect(mockGetAllRequest.onsuccess).toBeDefined();
      mockGetAllRequest.onsuccess();

      const items = await promise;
      expect(items).toEqual(mockItems);
    });

    it('should return empty array if database fails to open', async () => {
      vi.spyOn(console, 'error').mockReturnValue(undefined);
      mockIDBRequest.onerror = null as unknown as (event?: unknown) => void; // Prepare

      const promise = service.getAll('testStore');

      // Fail DB open
      const errorEvent = { target: { error: 'DB Error' } };
      mockIDBRequest.error = new Error('DB Error');
      // Call onerror if it was assigned
      // Note: getDB assigns onerror.

      // We assume setup happened synchronously inside getDB before await
      expect(mockIDBRequest.onerror).toBeDefined();
      mockIDBRequest.onerror(errorEvent);

      const result = await promise;
      expect(result).toEqual([]);
    });

    it('should reject if transaction/request fails', async () => {
      const mockGetAllRequest = {
        result: null,
        onsuccess: null as unknown as () => void,
        onerror: null as unknown as () => void,
        error: new Error('GetAll failed'),
      };
      mockIDBObjectStore.getAll.mockReturnValue(mockGetAllRequest);

      const promise = service.getAll('testStore');

      // Open DB
      mockIDBRequest.onsuccess();
      await new Promise((resolve) => setTimeout(resolve, 0));

      // Fail Request
      mockGetAllRequest.onerror();

      await expect(promise).rejects.toEqual(new Error('GetAll failed'));
    });
  });

  describe('clear', () => {
    it('should clear the store', async () => {
      const promise = service.clear('testStore');

      // Open DB
      mockIDBRequest.onsuccess();
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(mockIDBDatabase.transaction).toHaveBeenCalledWith(
        'testStore',
        'readwrite'
      );
      expect(mockIDBObjectStore.clear).toHaveBeenCalled();

      mockIDBTransaction.oncomplete();
      await expect(promise).resolves.not.toThrow();
    });

    it('should reject when the transaction aborts', async () => {
      const promise = service.clear('testStore');

      // Open DB
      mockIDBRequest.onsuccess();
      await new Promise((resolve) => setTimeout(resolve, 0));

      const error = new Error('QuotaExceededError');
      mockIDBTransaction.error = error;
      mockIDBTransaction.onabort();

      await expect(promise).rejects.toEqual(error);
    });
  });

  describe('clearAndPutAll', () => {
    // A full disk aborts the transaction without an error event: the save
    // waited forever, and every bookmark change queued behind it.
    it('should reject when the transaction aborts', async () => {
      mockIDBObjectStore.put.mockReturnValue({});
      const promise = service.clearAndPutAll('testStore', [{ id: 1 }]);

      // Open DB
      mockIDBRequest.onsuccess();
      await new Promise((resolve) => setTimeout(resolve, 0));

      const error = new Error('QuotaExceededError');
      mockIDBTransaction.error = error;
      mockIDBTransaction.onabort();

      await expect(promise).rejects.toEqual(error);
    });
  });

  describe('migrations', () => {
    it('should create object stores on upgrade needed', async () => {
      // Trigger getDB
      service.getAll('books'); // fire and forget to trigger open

      expect(mockIndexedDB.open).toHaveBeenCalledWith('offline-bible', 2);

      const upgradeEvent = {};

      // Test upgrade logic
      mockIDBRequest.result = mockIDBDatabase;

      // Case 1: stores don't exist
      mockIDBDatabase.objectStoreNames.contains.mockReturnValue(false);

      mockIDBRequest.onupgradeneeded(upgradeEvent);

      expect(mockIDBDatabase.createObjectStore).toHaveBeenCalledWith('books', {
        keyPath: 'id',
      });
      expect(mockIDBDatabase.createObjectStore).toHaveBeenCalledWith(
        'bookmarks',
        { keyPath: ['bookId', 'chapter'] }
      );
    });

    it('should not create existing object stores', async () => {
      service.getAll('books');

      mockIDBRequest.result = mockIDBDatabase;
      // Case 2: stores exist
      mockIDBDatabase.objectStoreNames.contains.mockReturnValue(true);

      mockIDBRequest.onupgradeneeded({});

      expect(mockIDBDatabase.createObjectStore).not.toHaveBeenCalled();
    });
  });

  describe('onblocked handler', () => {
    it('should warn when upgrade is blocked', async () => {
      vi.spyOn(console, 'warn').mockReturnValue(undefined);
      vi.spyOn(console, 'error').mockReturnValue(undefined);

      const promise = service.getAll('books');

      expect(mockIDBRequest.onblocked).toBeDefined();
      mockIDBRequest.onblocked();

      expect(console.warn).toHaveBeenCalledWith(
        'IndexedDB upgrade blocked. Close other tabs to continue.'
      );

      const result = await promise;
      expect(result).toEqual([]);
      expect(console.error).toHaveBeenCalled();
    });
  });

  describe('onversionchange handler', () => {
    it('should assign onversionchange on successful open', async () => {
      const mockGetAllRequest = {
        result: [],
        onsuccess: null as unknown as () => void,
        onerror: null as unknown as () => void,
      };
      mockIDBObjectStore.getAll.mockReturnValue(mockGetAllRequest);
      const promise = service.getAll('books');
      mockIDBRequest.onsuccess();
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(mockIDBDatabase.onversionchange).toBeDefined();

      if (mockGetAllRequest.onsuccess) {
        mockGetAllRequest.onsuccess();
      }
      await promise;
    });

    it('should close db and null reference when onversionchange fires', async () => {
      const closeSpy = vi.fn().mockName('close');
      mockIDBDatabase.close = closeSpy;
      const mockGetAllRequest = {
        result: [],
        onsuccess: null as unknown as () => void,
        onerror: null as unknown as () => void,
      };
      mockIDBObjectStore.getAll.mockReturnValue(mockGetAllRequest);

      const promise = service.getAll('books');
      mockIDBRequest.onsuccess();
      await new Promise((resolve) => setTimeout(resolve, 0));

      // Trigger version change
      expect(mockIDBDatabase.onversionchange).toBeDefined();
      mockIDBDatabase.onversionchange?.();

      expect(closeSpy).toHaveBeenCalled();

      if (mockGetAllRequest.onsuccess) {
        mockGetAllRequest.onsuccess();
      }
      await promise;
    });
  });

  describe('IndexedDB Unavailable', () => {
    it('should return null DB if indexedDB is undefined', async () => {
      const propDesc = Object.getOwnPropertyDescriptor(window, 'indexedDB');
      if (propDesc?.get) {
        (propDesc.get as Mock).mockReturnValue(undefined);
      } else {
        (
          window as unknown as {
            indexedDB: undefined;
          }
        ).indexedDB = undefined;
      }

      const promise = service.getAll('books');
      const result = await promise;
      expect(result).toEqual([]);
    });
  });
});
