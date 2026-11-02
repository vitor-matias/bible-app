import type { Mock, MockedObject } from 'vitest';
import { Injector } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { PluginListenerHandle } from '@capacitor/core';
import type { ConnectionStatus } from '@capacitor/network';
import { NETWORK_PLUGIN } from '../tokens';
import { NetworkService } from './network.service';
import { OfflineDataService } from './offline-data.service';

describe('NetworkService', () => {
  let service: NetworkService;
  let injectorGet: Mock;
  let offlineData: {
    preloadAllBooksAndChapters: Mock;
  };
  let mockStatus: ConnectionStatus;
  let mockNetworkListener: MockedObject<PluginListenerHandle>;
  let capturedCallback: ((status: ConnectionStatus) => void) | undefined;
  // biome-ignore lint/suspicious/noExplicitAny: Mocking Capacitor plugin
  let mockNetworkPlugin: MockedObject<any>;

  beforeEach(async () => {
    mockStatus = {
      connected: true,
      connectionType: 'wifi',
    };
    capturedCallback = undefined;
    mockNetworkListener = {
      remove: vi.fn().mockName('PluginListenerHandle.remove'),
    };
    mockNetworkListener.remove.mockResolvedValue();

    offlineData = {
      preloadAllBooksAndChapters: vi
        .fn()
        .mockName('preloadAllBooksAndChapters')
        .mockResolvedValue(),
    };

    mockNetworkPlugin = {
      addListener: vi.fn().mockName('Network.addListener'),
      getStatus: vi.fn().mockName('Network.getStatus'),
    };
    mockNetworkPlugin.addListener.mockImplementation(
      (eventName: string, callback: (status: ConnectionStatus) => void) => {
        if (eventName === 'networkStatusChange') {
          capturedCallback = callback;
          return Promise.resolve(mockNetworkListener);
        }
        return Promise.resolve({
          remove: () => Promise.resolve(),
        } as PluginListenerHandle);
      }
    );
    mockNetworkPlugin.getStatus.mockImplementation(() =>
      Promise.resolve(mockStatus)
    );

    TestBed.configureTestingModule({
      providers: [
        { provide: NETWORK_PLUGIN, useValue: mockNetworkPlugin },
        { provide: OfflineDataService, useValue: offlineData },
      ],
    });
    service = TestBed.inject(NetworkService);
    // After construction, so only the service's own lookups are counted.
    injectorGet = vi.spyOn(TestBed.inject(Injector), 'get');

    // Flush microtasks to ensure initial getStatus resolves
    await Promise.resolve();
    await Promise.resolve();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should handle initially connected state', () => {
    expect(service.isOffline).toBe(false);
  });

  it('should handle initially disconnected state', async () => {
    mockStatus.connected = false;
    mockStatus.connectionType = 'none';

    // Instantiate new service - it will use the mocked Network plugin
    const newService = TestBed.runInInjectionContext(
      () => new NetworkService()
    );

    // Wait for constructor's init
    await Promise.resolve();
    await Promise.resolve();

    expect(newService.isOffline).toBe(true);
  });

  it('should update offline state via network listener', () => {
    expect(capturedCallback).toBeDefined(
      'networkStatusChange listener should be registered'
    );

    if (capturedCallback) {
      capturedCallback({ connected: false, connectionType: 'none' });
      expect(service.isOffline).toBe(true);

      capturedCallback({ connected: true, connectionType: 'wifi' });
      expect(service.isOffline).toBe(false);
    }
  });

  it('should remove listener on destroy', async () => {
    service.ngOnDestroy();
    await Promise.resolve();
    expect(mockNetworkListener.remove).toHaveBeenCalled();
  });

  it('should preload offline content when transitioning offline -> online', async () => {
    injectorGet.mockClear();

    expect(capturedCallback).toBeDefined();
    capturedCallback?.({ connected: false, connectionType: 'none' });
    expect(service.isOffline).toBe(true);

    capturedCallback?.({ connected: true, connectionType: 'wifi' });

    // The reconnect hook lazy-imports OfflineDataService before resolving it,
    // so poll until the dynamic import settles.
    // The reconnect hook lazy-imports OfflineDataService; on a cold run that
    // import can outlast a fixed 200ms budget, and the test then fails on the
    // injector expectation rather than on the thing it covers.
    const deadline = Date.now() + 2000;
    while (
      vi.mocked(offlineData.preloadAllBooksAndChapters).mock.calls.length ===
        0 &&
      Date.now() < deadline
    ) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }

    expect(injectorGet).toHaveBeenCalledWith(OfflineDataService);
    expect(offlineData.preloadAllBooksAndChapters).toHaveBeenCalledWith(
      'standalone'
    );
  });
});
