import type { Mock, MockedObject } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { AnalyticsService } from './analytics.service';
import { NativeShellService } from './native-shell.service';
import { PreferencesService } from './preferences.service';
import { ThemeService } from './theme.service';

describe('ThemeService', () => {
  let service: ThemeService;
  let prefsSpy: MockedObject<PreferencesService>;
  let classListToggleSpy: Mock;
  let nativeShellSpy: MockedObject<NativeShellService>;

  beforeEach(() => {
    prefsSpy = {
      getTheme: vi.fn().mockName('PreferencesService.getTheme'),
      setTheme: vi.fn().mockName('PreferencesService.setTheme'),
    };
    prefsSpy.getTheme.mockReturnValue(null);

    classListToggleSpy = vi
      .spyOn(document.documentElement.classList, 'toggle')
      .mockReturnValue(undefined);

    nativeShellSpy = {
      setNavigationBarTheme: vi
        .fn()
        .mockName('NativeShellService.setNavigationBarTheme'),
    };
    const analyticsSpy = {
      track: vi.fn().mockName('AnalyticsService.track'),
    };
    analyticsSpy.track.mockResolvedValue();

    TestBed.configureTestingModule({
      providers: [
        ThemeService,
        { provide: PreferencesService, useValue: prefsSpy },
        { provide: AnalyticsService, useValue: analyticsSpy },
        { provide: NativeShellService, useValue: nativeShellSpy },
      ],
    });
  });

  function createService(): ThemeService {
    return TestBed.inject(ThemeService);
  }

  it('should be created', () => {
    service = createService();
    expect(service).toBeTruthy();
  });

  it('should default to system theme when no saved preference', () => {
    prefsSpy.getTheme.mockReturnValue(null);
    service = createService();
    expect(service.currentMode).toBe('system');
  });

  it('should restore saved theme from preferences', () => {
    prefsSpy.getTheme.mockReturnValue('dark');
    service = createService();
    expect(service.currentMode).toBe('dark');
  });

  it('should apply dark-theme class when mode is dark', () => {
    prefsSpy.getTheme.mockReturnValue('dark');
    service = createService();
    expect(classListToggleSpy).toHaveBeenCalledWith('dark-theme', true);
  });

  it('should apply light theme (no dark-theme class) when mode is light', () => {
    prefsSpy.getTheme.mockReturnValue('light');
    service = createService();
    expect(classListToggleSpy).toHaveBeenCalledWith('dark-theme', false);
  });

  it('should cycle through themes on toggleTheme', () => {
    prefsSpy.getTheme.mockReturnValue('light');
    service = createService();
    const analyticsSpy = TestBed.inject(
      AnalyticsService
    ) as MockedObject<AnalyticsService>;

    // light -> dark
    service.toggleTheme();
    expect(service.currentMode).toBe('dark');
    expect(prefsSpy.setTheme).toHaveBeenCalledWith('dark');
    expect(analyticsSpy.track).toHaveBeenCalledWith('theme-dark');

    // dark -> system
    service.toggleTheme();
    expect(service.currentMode).toBe('system');
    expect(prefsSpy.setTheme).toHaveBeenCalledWith('system');
    expect(analyticsSpy.track).toHaveBeenCalledWith('theme-system');

    // system -> light
    service.toggleTheme();
    expect(service.currentMode).toBe('light');
    expect(prefsSpy.setTheme).toHaveBeenCalledWith('light');
    expect(analyticsSpy.track).toHaveBeenCalledWith('theme-light');
  });

  it('should emit theme mode changes through themeMode$', () => {
    prefsSpy.getTheme.mockReturnValue('light');
    service = createService();
    const analyticsSpy = TestBed.inject(
      AnalyticsService
    ) as MockedObject<AnalyticsService>;

    const emitted: string[] = [];
    service.themeMode$.subscribe((mode) => emitted.push(mode));

    service.toggleTheme(); // -> dark
    expect(analyticsSpy.track).toHaveBeenCalledWith('theme-dark');

    service.toggleTheme(); // -> system
    expect(analyticsSpy.track).toHaveBeenCalledWith('theme-system');

    expect(emitted).toEqual(['light', 'dark', 'system']);
  });

  it('should use addEventListener when available (modern browsers)', () => {
    const mockMql = {
      matches: false,
      addEventListener: vi.fn().mockName('addEventListener'),
      addListener: vi.fn().mockName('addListener'),
    };
    vi.spyOn(window, 'matchMedia').mockReturnValue(
      mockMql as unknown as MediaQueryList
    );

    prefsSpy.getTheme.mockReturnValue(null);
    // Need a new instance to trigger the constructor with the mocked matchMedia
    service = TestBed.runInInjectionContext(() => new ThemeService());

    expect(mockMql.addEventListener).toHaveBeenCalledWith(
      'change',
      expect.any(Function)
    );
    expect(mockMql.addListener).not.toHaveBeenCalled();
  });

  it('should fall back to addListener when addEventListener is not available', () => {
    const mockMql = {
      matches: false,
      addEventListener: undefined,
      addListener: vi.fn().mockName('addListener'),
    };
    vi.spyOn(window, 'matchMedia').mockReturnValue(
      mockMql as unknown as MediaQueryList
    );

    prefsSpy.getTheme.mockReturnValue(null);
    service = TestBed.runInInjectionContext(() => new ThemeService());

    expect(mockMql.addListener).toHaveBeenCalledWith(expect.any(Function));
  });

  it('should update theme when system preference changes while in system mode', () => {
    let changeHandler: (() => void) | undefined;
    const mockMql = {
      matches: true,
      addEventListener: (_event: string, handler: () => void) => {
        changeHandler = handler;
      },
      addListener: vi.fn().mockName('addListener'),
    };
    vi.spyOn(window, 'matchMedia').mockReturnValue(
      mockMql as unknown as MediaQueryList
    );

    prefsSpy.getTheme.mockReturnValue('system');
    service = TestBed.runInInjectionContext(() => new ThemeService());

    classListToggleSpy.mockClear();
    changeHandler?.();

    expect(classListToggleSpy).toHaveBeenCalledWith('dark-theme', true);
  });

  it('should NOT update theme when system preference changes while in non-system mode', () => {
    let changeHandler: (() => void) | undefined;
    const mockMql = {
      matches: true,
      addEventListener: (_event: string, handler: () => void) => {
        changeHandler = handler;
      },
      addListener: vi.fn().mockName('addListener'),
    };
    vi.spyOn(window, 'matchMedia').mockReturnValue(
      mockMql as unknown as MediaQueryList
    );

    prefsSpy.getTheme.mockReturnValue('dark');
    service = TestBed.runInInjectionContext(() => new ThemeService());

    classListToggleSpy.mockClear();
    changeHandler?.();

    // Should not have been called again since mode is "dark", not "system"
    expect(classListToggleSpy).not.toHaveBeenCalled();
  });

  // The app's theme can differ from the device's; the navigation bar icons
  // must follow the app's, or they vanish against the page.
  it('passes the applied theme to the native navigation bar', () => {
    prefsSpy.getTheme.mockReturnValue('dark');
    service = createService();
    expect(nativeShellSpy.setNavigationBarTheme).toHaveBeenCalledWith(true);

    nativeShellSpy.setNavigationBarTheme.mockClear();
    service.toggleTheme(); // dark -> system
    service.toggleTheme(); // system -> light
    expect(nativeShellSpy.setNavigationBarTheme).toHaveBeenCalledWith(false);
  });

  // The iOS native menu picks a theme directly instead of cycling.
  it('sets, applies and saves a chosen theme', () => {
    service = createService();
    classListToggleSpy.mockClear();

    service.setTheme('dark');

    expect(service.currentMode).toBe('dark');
    expect(classListToggleSpy).toHaveBeenCalledWith('dark-theme', true);
    expect(prefsSpy.setTheme).toHaveBeenCalledWith('dark');
  });

  // Re-tapping the current choice in the iOS menu's theme row.
  it('does nothing for the theme already on', () => {
    prefsSpy.getTheme.mockReturnValue('dark');
    service = createService();
    const analytics = TestBed.inject(
      AnalyticsService
    ) as MockedObject<AnalyticsService>;
    classListToggleSpy.mockClear();

    service.setTheme('dark');

    expect(classListToggleSpy).not.toHaveBeenCalled();
    expect(prefsSpy.setTheme).not.toHaveBeenCalled();
    expect(analytics.track).not.toHaveBeenCalled();
  });
});
