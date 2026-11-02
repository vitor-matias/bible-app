import type { Mock } from 'vitest';
import { OverlayContainer } from '@angular/cdk/overlay';
import { DOCUMENT } from '@angular/common';
import { TestBed } from '@angular/core/testing';
import { Capacitor } from '@capacitor/core';
import { NATIVE_CHROME_PLUGIN } from '../tokens';
import type { PassagePickerData } from '../utils/passage-picker';
import {
  ANDROID_HIDE_DISTANCE,
  ANDROID_REVEAL_DISTANCE,
  COLLAPSE_DISTANCE,
  FLING_REVEAL_SPEED,
  NativeChromeService,
} from './native-chrome.service';
import type {
  NativeChromeAction,
  ReaderChrome,
  SearchChrome,
} from './native-chrome.types';

const READER: ReaderChrome = {
  mode: 'reader',
  themeMode: 'system',
  passageLabel: 'Génesis 1',
  passageShortLabels: ['Gn 1'],
  passageAccessibilityLabel: 'Génesis 1',
  chapterNavigation: true,
  canGoPrevious: true,
  canGoNext: true,
  search: true,
  viewMode: 'scrolling',
  autoScrollVisible: false,
  autoScrollAvailable: true,
  canShare: true,
  canReport: true,
  bookmarkColor: null,
  bookmarkName: null,
  buildVersion: null,
  textSize: null,
};

const SEARCH: SearchChrome = { mode: 'search', themeMode: 'dark', query: '' };

describe('NativeChromeService', () => {
  beforeEach(() => {
    vi.useFakeTimers({ advanceTimeDelta: 1, shouldAdvanceTime: true });
  });
  afterEach(() => {
    vi.useRealTimers();
  });
  let plugin: {
    setState: Mock;
    setProgress: Mock;
    showPicker: Mock;
    showBookmarks: Mock;
    updateBookmarks: Mock;
    showToast: Mock;
    hideToast: Mock;
    showReport: Mock;
    finishReport: Mock;
    showOnboarding: Mock;
    share: Mock;
    addListener: Mock;
  };
  /** Tests that need more of the document add it. */
  let doc: Record<string, unknown>;
  let body: HTMLElement;
  let root: HTMLElement;
  let overlays: HTMLElement;

  beforeEach(() => {
    plugin = {
      setState: vi
        .fn()
        .mockName('setState')
        .mockResolvedValue({ top: 116, bottom: 82 }),
      setProgress: vi.fn().mockName('setProgress').mockResolvedValue(),
      showPicker: vi.fn().mockName('showPicker').mockResolvedValue(),
      showBookmarks: vi.fn().mockName('showBookmarks').mockResolvedValue(),
      updateBookmarks: vi.fn().mockName('updateBookmarks').mockResolvedValue(),
      showToast: vi.fn().mockName('showToast').mockResolvedValue(),
      hideToast: vi.fn().mockName('hideToast').mockResolvedValue(),
      showReport: vi.fn().mockName('showReport').mockResolvedValue(),
      finishReport: vi.fn().mockName('finishReport').mockResolvedValue(),
      showOnboarding: vi.fn().mockName('showOnboarding').mockResolvedValue(),
      share: vi.fn().mockName('share').mockResolvedValue(),
      addListener: vi.fn().mockName('addListener').mockResolvedValue(),
    };
    body = document.createElement('body');
    root = document.createElement('html');
    overlays = document.createElement('div');
    // Listeners on the document go on its <html>, which events from the
    // page inside it pass through, as they pass the real document.
    doc = {
      body,
      documentElement: root,
      addEventListener: root.addEventListener.bind(root),
      removeEventListener: root.removeEventListener.bind(root),
    };
    TestBed.configureTestingModule({
      providers: [
        { provide: NATIVE_CHROME_PLUGIN, useValue: plugin },
        { provide: DOCUMENT, useValue: doc },
        {
          provide: OverlayContainer,
          useValue: { getContainerElement: () => overlays },
        },
      ],
    });
  });

  function create(
    platform: 'ios' | 'android' | 'web',
    pluginAvailable = true
  ): NativeChromeService {
    vi.spyOn(Capacitor, 'getPlatform').mockReturnValue(platform);
    vi.spyOn(Capacitor, 'isPluginAvailable').mockReturnValue(pluginAvailable);
    const service = TestBed.inject(NativeChromeService);
    service.init();
    return service;
  }

  /** Lets MutationObserver callbacks and plugin promises run. */
  const settle = () => new Promise((resolve) => setTimeout(resolve));

  const lastState = () => vi.mocked(plugin.setState).mock.lastCall[0];

  function listener(event: 'action' | 'insets' | 'palette') {
    const call = vi
      .mocked(plugin.addListener)
      .mock.calls.find(({ args }) => args[0] === event);
    return call?.args[1];
  }

  it('is enabled in the iOS app, which provides the plugin', () => {
    expect(create('ios').enabled).toBe(true);
  });

  it('is enabled in the Android app, whose shell draws Material bars', () => {
    const service = create('android');
    expect(service.enabled).toBe(true);
    expect(body.classList).toContain('native-chrome');
    expect(plugin.addListener).toHaveBeenCalledWith(
      'action',
      expect.any(Function)
    );
  });

  // An Android shell from before the native bars has no plugin: the web
  // header stays. The web never has the bars, whatever reports a plugin.
  for (const [platform, available] of [
    ['android', false],
    ['web', true],
    ['ios', false],
  ] as const) {
    it(`does nothing on ${platform} with the plugin ${
      available ? 'present' : 'absent'
    }`, async () => {
      const service = create(platform, available);
      service.show(READER);
      service.hide();
      service.showPicker({} as PassagePickerData);
      const stop = service.trackScroll(document.createElement('div'));
      stop();
      await vi.advanceTimersByTimeAsync(0);

      expect(service.enabled).toBe(false);
      expect(body.classList).not.toContain('native-chrome');
      expect(plugin.addListener).not.toHaveBeenCalled();
      expect(plugin.setState).not.toHaveBeenCalled();
      expect(plugin.showPicker).not.toHaveBeenCalled();
    });
  }

  it("marks the body so pages drop their web headers' space", () => {
    create('ios');
    expect(body.classList).toContain('native-chrome');
  });

  it("shows the page's bars", () => {
    create('ios').show(READER);
    expect(lastState()).toEqual({
      ...READER,
      inert: false,
      collapsed: false,
      scrolled: false,
      subtitle: null,
      autoScroll: null,
      pageColor: null,
    });
  });

  // The Android bar is the page's colour at rest and Material's container
  // colour once text scrolls under it.
  describe('text scrolled under the top bar', () => {
    let page: HTMLElement;

    beforeEach(() => {
      page = document.createElement('div');
      root.appendChild(page);
    });

    afterEach(() => page.remove());

    function scrollTo(top: number): void {
      Object.defineProperty(page, 'scrollTop', {
        value: top,
        configurable: true,
      });
      page.dispatchEvent(new Event('scroll'));
    }

    it('is sent to the Android bar as the page scrolls in any element', () => {
      create('android').show(READER);
      scrollTo(40);
      expect(lastState()).toEqual(expect.objectContaining({ scrolled: true }));
      scrollTo(0);
      expect(lastState()).toEqual(expect.objectContaining({ scrolled: false }));
    });

    // Under the reader's own top margin the text hasn't reached the bar yet.
    it('waits for the text to reach the bar', () => {
      create('android').show(READER);
      scrollTo(5);
      expect(lastState()).toEqual(expect.objectContaining({ scrolled: false }));
      scrollTo(9);
      expect(lastState()).toEqual(expect.objectContaining({ scrolled: true }));
    });

    it('is sent once per change, not per scroll', () => {
      create('android').show(READER);
      scrollTo(40);
      const calls = vi.mocked(plugin.setState).mock.calls.length;
      scrollTo(80);
      expect(vi.mocked(plugin.setState).mock.calls.length).toBe(calls);
    });

    it('starts afresh on another kind of page', () => {
      const service = create('android');
      service.show(READER);
      scrollTo(40);
      service.show(SEARCH);
      expect(lastState()).toEqual(expect.objectContaining({ scrolled: false }));
    });

    // A list scrolling beside the reader (the book drawer's) isn't the
    // reader's text, and the text's place is its scroller's.
    it("follows the reader's own scroller, not one beside it", () => {
      const service = create('android');
      service.show(READER);
      const stop = service.trackScroll(page);
      const drawer = document.createElement('div');
      root.appendChild(drawer);
      Object.defineProperty(drawer, 'scrollTop', { value: 400 });
      drawer.dispatchEvent(new Event('scroll'));
      expect(lastState()).toEqual(expect.objectContaining({ scrolled: false }));

      // The pages scroll across inside it: still the reader's place.
      scrollTo(40);
      const pages = document.createElement('div');
      page.appendChild(pages);
      pages.dispatchEvent(new Event('scroll'));
      expect(lastState()).toEqual(expect.objectContaining({ scrolled: true }));
      stop();
      drawer.remove();
    });

    it("leaves a menu's or a dialog's scrolling out, on other pages", () => {
      create('android').show(SEARCH);
      root.appendChild(overlays);
      const list = document.createElement('div');
      overlays.appendChild(list);
      Object.defineProperty(list, 'scrollTop', { value: 400 });
      list.dispatchEvent(new Event('scroll'));
      expect(lastState()).toEqual(expect.objectContaining({ scrolled: false }));
      overlays.remove();
    });

    // Each push rebuilds the iOS bars: none for a colour they don't show.
    it("isn't followed in the iOS app", () => {
      create('ios').show(READER);
      const calls = vi.mocked(plugin.setState).mock.calls.length;
      scrollTo(40);
      expect(vi.mocked(plugin.setState).mock.calls.length).toBe(calls);
    });
  });

  it('pads the page by the space the bars cover', async () => {
    create('ios').show(READER);
    await settle();
    expect(root.style.getPropertyValue('--native-chrome-top')).toBe('116px');
    expect(root.style.getPropertyValue('--native-chrome-bottom')).toBe('82px');

    // The search field rides up with the keyboard.
    listener('insets')({ top: 116, bottom: 380 });
    expect(root.style.getPropertyValue('--native-chrome-bottom')).toBe('380px');
  });

  // The Android bars take the wallpaper's colours: the cards among them follow.
  it("passes the bars' surface to the page's cards", () => {
    create('android');
    listener('palette')({ surfaceContainerHigh: '#DCE3F0' });
    expect(
      body.style.getPropertyValue('--android-surface-container-high')
    ).toBe('#DCE3F0');
  });

  it('relays taps, with their details', () => {
    const service = create('ios');
    const actions: NativeChromeAction[] = [];
    service.actions$.subscribe((action) => actions.push(action));

    listener('action')({ id: 'bookmarks' });
    listener('action')({ id: 'goto', bookId: 'exo', chapter: 2 });

    expect(actions).toEqual([
      { id: 'bookmarks' },
      { id: 'goto', bookId: 'exo', chapter: 2 },
    ]);
  });

  it('opens the passage picker', () => {
    const data: PassagePickerData = {
      sections: [],
      currentBookId: 'gen',
      currentChapter: 1,
    };
    create('ios').showPicker(data);
    expect(plugin.showPicker).toHaveBeenCalledWith(data);
  });

  it('removes the bars once the page is gone', async () => {
    const service = create('ios');
    service.show(READER);
    service.hide();
    expect(plugin.setState).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(0);
    expect(lastState()).toEqual({ mode: 'none' });
  });

  // A route change destroys one page and creates the next.
  it('keeps the bars up when the next page takes over at once', async () => {
    const service = create('ios');
    service.show(READER);
    service.hide();
    service.show(SEARCH);
    await vi.advanceTimersByTimeAsync(0);

    expect(plugin.setState).not.toHaveBeenCalledWith({ mode: 'none' });
    expect(lastState()).toEqual({
      ...SEARCH,
      inert: false,
      collapsed: false,
      scrolled: false,
      subtitle: null,
      autoScroll: null,
      pageColor: null,
    });
  });

  // A panel (footnotes, a dialog) opens under the bars, which sit above the
  // whole web view: they slide away while it is open.
  it("hides the reader's bars while a dialog's backdrop shows", async () => {
    create('ios').show(READER);
    const backdrop = document.createElement('div');
    backdrop.className = 'cdk-overlay-backdrop cdk-overlay-dark-backdrop';
    overlays.appendChild(backdrop);
    await settle();
    // Not showing yet: the backdrop fades in once attached.
    expect(plugin.setState).toHaveBeenCalledTimes(1);

    backdrop.classList.add('cdk-overlay-backdrop-showing');
    await settle();
    expect(lastState()).toEqual(
      expect.objectContaining({ inert: true, collapsed: true })
    );

    backdrop.classList.remove('cdk-overlay-backdrop-showing');
    await settle();
    expect(lastState()).toEqual(
      expect.objectContaining({ inert: false, collapsed: false })
    );
  });

  it("keeps the search page's bars, inert, under a dialog", async () => {
    create('ios').show(SEARCH);
    const backdrop = document.createElement('div');
    backdrop.className =
      'cdk-overlay-backdrop cdk-overlay-dark-backdrop cdk-overlay-backdrop-showing';
    overlays.appendChild(backdrop);
    await settle();

    expect(lastState()).toEqual(
      expect.objectContaining({ inert: true, collapsed: false })
    );
  });

  it('passes toasts through', () => {
    create('ios').toast('Copiado');

    expect(plugin.showToast).toHaveBeenCalledTimes(1);

    expect(plugin.showToast).toHaveBeenCalledWith({ message: 'Copiado' });
  });

  describe('a toast that is a button', () => {
    let service: NativeChromeService;
    let goBack: Mock;
    let hide: () => void;

    beforeEach(() => {
      service = create('ios');
      goBack = vi.fn().mockName('goBack');
      hide = service.toast('Voltar para Gn 1,3', {
        symbol: 'arrow.uturn.backward',
        onTap: goBack,
      });
    });

    it('shows it as a button, with its symbol', () => {
      expect(plugin.showToast).toHaveBeenCalledWith({
        message: 'Voltar para Gn 1,3',
        button: true,
        symbol: 'arrow.uturn.backward',
      });
    });

    it('runs the action once, when it is tapped', () => {
      const actions: NativeChromeAction[] = [];
      service.actions$.subscribe((action) => actions.push(action));

      listener('action')({ id: 'toast-action' });
      listener('action')({ id: 'toast-action' });

      expect(goBack).toHaveBeenCalledTimes(1);
      expect(actions).toEqual([]);
    });

    it('forgets the action once another toast replaces it', () => {
      service.toast('Copiado');
      listener('action')({ id: 'toast-action' });

      expect(goBack).not.toHaveBeenCalled();
    });

    it('takes it down early, and its action with it', () => {
      hide();
      listener('action')({ id: 'toast-action' });

      expect(plugin.hideToast).toHaveBeenCalledTimes(1);
      expect(goBack).not.toHaveBeenCalled();
    });

    it('leaves a toast that has replaced it alone', () => {
      service.toast('Copiado');
      hide();

      expect(plugin.hideToast).not.toHaveBeenCalled();
    });
  });

  it('has nothing to take down outside the iOS app', () => {
    create('web').toast('Voltar para Gn 1,3', { onTap: () => {} })();

    expect(plugin.hideToast).not.toHaveBeenCalled();
  });

  it('passes the report sheet and the outcome through', () => {
    const service = create('ios');
    const state = {
      message: 'Encontrou algum problema?',
      topics: [{ value: 'typo', label: 'Erro ortográfico' }],
      placeholder: '',
      maxLength: 500,
    };
    service.showReport(state);
    service.finishReport({ sent: false, message: 'Tente novamente.' });

    expect(plugin.showReport).toHaveBeenCalledWith(state);
    expect(plugin.finishReport).toHaveBeenCalledWith({
      sent: false,
      message: 'Tente novamente.',
    });
  });

  // The pages scroll in elements of their own, out of the web view's reach.
  describe('a tap on the status bar', () => {
    let scroller: HTMLElement;
    let line: HTMLElement;
    let reduceMotion: boolean;
    let scrollTo: Mock;

    beforeEach(() => {
      scroller = document.createElement('div');
      scroller.style.cssText = 'height: 100px; overflow-y: scroll';
      line = document.createElement('p');
      line.style.height = '2000px';
      scroller.appendChild(line);
      document.body.appendChild(scroller);
      scroller.scrollTop = 600;
      reduceMotion = false;
      Object.assign(doc, {
        defaultView: {
          innerWidth: 400,
          innerHeight: 800,
          matchMedia: () => ({ matches: reduceMotion }),
        },
        scrollingElement: document.documentElement,
        // Under the middle of the screen: a line of the text.
        elementFromPoint: (x: number, y: number) =>
          x === 200 && y === 400 ? line : null,
      });
      scrollTo = vi.spyOn(scroller, 'scrollTo').mockReturnValue(undefined);
    });

    afterEach(() => scroller.remove());

    const tap = () => listener('action')({ id: 'scroll-top' });

    it('glides the text under the middle of the screen to the top', () => {
      const service = create('ios');
      const actions: NativeChromeAction[] = [];
      service.actions$.subscribe((action) => actions.push(action));
      tap();

      expect(scrollTo).toHaveBeenCalledTimes(1);

      expect(scrollTo).toHaveBeenCalledWith({
        top: 0,
        behavior: 'smooth',
      });
      expect(actions).toEqual([]);
    });

    it("brings the reader's bars back", () => {
      const service = create('ios');
      service.show(READER);
      service.trackScroll(scroller);
      scroller.dispatchEvent(new Event('touchmove'));
      scroller.scrollTop = 600 + COLLAPSE_DISTANCE;
      scroller.dispatchEvent(new Event('scroll'));
      expect(lastState().collapsed).toBe(true);

      tap();
      expect(lastState().collapsed).toBe(false);
    });

    it('jumps with reduced motion, and while auto-scroll plays', () => {
      const service = create('ios');
      reduceMotion = true;
      tap();
      reduceMotion = false;
      service.show(READER);
      service.setAutoScroll({
        playing: true,
        speedLabel: '1',
        speedAccessibilityLabel: '1 linha por segundo',
        canSlower: true,
        canFaster: true,
        canPlay: true,
      });
      tap();

      expect(scrollTo).toHaveBeenCalledTimes(2);
      for (const call of vi.mocked(scrollTo).mock.calls) {
        expect(call.args[0]).toEqual({ top: 0, behavior: 'auto' });
      }
    });

    it('leaves a page already at the top alone', () => {
      create('ios');
      scroller.scrollTop = 0;
      const pageScroll = vi
        .spyOn(document.body, 'scrollTo')
        .mockReturnValue(undefined);
      tap();

      expect(scrollTo).not.toHaveBeenCalled();
      expect(pageScroll).not.toHaveBeenCalled();
    });
  });

  // Over another sheet (say the onboarding) the shell shows none, and no
  // *-closed event would ever end the page's session with it.
  it('says whether a sheet came up', async () => {
    const service = create('ios');
    const state = {
      currentLabel: 'Mateus 11',
      ribbons: [],
      move: null,
      canMark: true,
    };
    plugin.showBookmarks.mockResolvedValue({ presented: true });
    expect(await service.showBookmarks(state)).toBe(true);

    plugin.showBookmarks.mockResolvedValue({ presented: false });
    expect(await service.showBookmarks(state)).toBe(false);

    plugin.showBookmarks.mockRejectedValue(new Error('no chrome'));
    expect(await service.showBookmarks(state)).toBe(false);
  });

  // A sheet that never came up (UIKit refuses one while another is on its
  // way) is not the onboarding seen: only a dismissal answers with a result.
  it('tells a dismissed onboarding from one that never came up', async () => {
    const service = create('ios');
    plugin.showOnboarding.mockResolvedValue({
      presented: true,
      completed: false,
      lastStep: 'navigate',
    });
    expect(await service.showOnboarding([])).toEqual({
      completed: false,
      lastStep: 'navigate',
    });

    plugin.showOnboarding.mockResolvedValue({ presented: false });
    expect(await service.showOnboarding([])).toBeNull();

    plugin.showOnboarding.mockRejectedValue(new Error('no chrome'));
    expect(await service.showOnboarding([])).toBeNull();
  });

  // The shell previews the link with the app's icon; given a bare URL, iOS
  // fetched the website's, which has the WEB sash.
  it('hands the shell the share, and says whether something was shared', async () => {
    const service = create('ios');
    const options = {
      title: 'Bíblia Sagrada',
      text: 'Ler Mateus 5.',
      url: 'https://biblia.capuchinhos.org/mat/5',
      linkTitle: 'Mateus 5 | Bíblia Sagrada',
    };
    plugin.share.mockResolvedValue({ completed: true });
    expect(await service.share(options)).toBe(true);
    expect(plugin.share).toHaveBeenCalledWith(options);

    plugin.share.mockResolvedValue({ completed: false });
    expect(await service.share(options)).toBe(false);

    plugin.share.mockRejectedValue(new Error('no chrome'));
    expect(await service.share(options)).toBe(false);
  });

  // Each push has the shell rebuild its bars and menu.
  it('sends the bars once while they stay the same', () => {
    const service = create('ios');
    service.show(READER);
    service.show({ ...READER });
    expect(plugin.setState).toHaveBeenCalledTimes(1);

    service.show({ ...READER, canGoNext: !READER.canGoNext });
    expect(plugin.setState).toHaveBeenCalledTimes(2);
  });

  it('sends them again after a push that failed', async () => {
    const service = create('ios');
    plugin.setState.mockRejectedValue(new Error('not ready'));
    service.show(READER);
    await settle();

    plugin.setState.mockResolvedValue({ top: 116, bottom: 82 });
    service.show(READER);
    expect(plugin.setState).toHaveBeenCalledTimes(2);
  });

  it('passes the bookmarks sheet through', () => {
    const service = create('ios');
    const state = {
      currentLabel: 'Mateus 11',
      ribbons: [],
      move: null,
      canMark: true,
    };
    service.showBookmarks(state);
    service.updateBookmarks(state);

    expect(plugin.showBookmarks).toHaveBeenCalledWith(state);
    expect(plugin.updateBookmarks).toHaveBeenCalledWith(state);
  });

  it("ignores a menu's transparent backdrop", async () => {
    create('ios').show(READER);
    const backdrop = document.createElement('div');
    backdrop.className =
      'cdk-overlay-backdrop cdk-overlay-transparent-backdrop cdk-overlay-backdrop-showing';
    overlays.appendChild(backdrop);
    await settle();

    expect(plugin.setState).toHaveBeenCalledTimes(1);
  });

  describe("hiding the reader's bars while reading", () => {
    let scroller: HTMLElement;
    let service: NativeChromeService;

    beforeEach(() => {
      scroller = document.createElement('div');
      scroller.style.cssText = 'height: 100px; overflow-y: scroll';
      const content = document.createElement('div');
      content.style.height = '2000px';
      scroller.appendChild(content);
      document.body.appendChild(scroller);
      service = create('ios');
      service.show(READER);
    });

    afterEach(() => scroller.remove());

    /** The reader scrolling with a finger. */
    const scrollTo = (top: number) => {
      scroller.dispatchEvent(new Event('touchmove'));
      scroller.scrollTop = top;
      scroller.dispatchEvent(new Event('scroll'));
    };
    const collapsed = () => lastState().collapsed;

    // The shell answers with the insets alone here, as older ones do: the
    // page's edge fades follow what it asked for.
    it('hides them on scrolling down, and brings them back on scrolling up', () => {
      service.trackScroll(scroller);

      scrollTo(10);
      expect(collapsed()).toBe(false);
      scrollTo(10 + COLLAPSE_DISTANCE);
      expect(collapsed()).toBe(true);
      expect(body.classList).toContain('native-chrome-collapsed');

      scrollTo(500);
      scrollTo(500 - COLLAPSE_DISTANCE);
      expect(collapsed()).toBe(false);
      expect(body.classList).not.toContain('native-chrome-collapsed');
    });

    // Under VoiceOver the shell keeps its bars, and the text showed through
    // them where the fades were.
    it('keeps the edge fades while the shell keeps its bars', () => {
      listener('insets')({ top: 116, bottom: 82, collapsed: false });
      service.trackScroll(scroller);
      scrollTo(200);

      expect(collapsed()).toBe(true);
      expect(body.classList).not.toContain('native-chrome-collapsed');

      listener('insets')({ top: 116, bottom: 82, collapsed: true });
      expect(body.classList).toContain('native-chrome-collapsed');
    });

    it("takes whether they hid from the shell's answer to a push too", async () => {
      plugin.setState.mockResolvedValue({
        top: 116,
        bottom: 82,
        collapsed: false,
      });
      service.trackScroll(scroller);
      scrollTo(200);
      await settle();

      expect(collapsed()).toBe(true);
      expect(body.classList).not.toContain('native-chrome-collapsed');
    });

    it('brings them back when the passage left in their place is tapped', () => {
      service.trackScroll(scroller);
      scrollTo(200);
      expect(collapsed()).toBe(true);

      listener('action')({ id: 'show-bars' });
      expect(collapsed()).toBe(false);
    });

    it('brings them back at the end of the chapter, where the arrows are', () => {
      service.trackScroll(scroller);
      scrollTo(200);
      expect(collapsed()).toBe(true);

      scrollTo(scroller.scrollHeight - scroller.clientHeight);
      expect(collapsed()).toBe(false);
    });

    it('brings them back when tracking stops', () => {
      const stop = service.trackScroll(scroller);
      scrollTo(200);
      stop();

      expect(collapsed()).toBe(false);
      scrollTo(600);
      expect(collapsed()).toBe(false);
    });

    // Paused, the shell hides auto-scroll's play button with the bars.
    it("hides them while reading with auto-scroll's controls up", () => {
      const autoScroll = {
        playing: false,
        speedLabel: '1',
        speedAccessibilityLabel: '1 linha por segundo',
        canSlower: true,
        canFaster: true,
        canPlay: true,
      };
      service.trackScroll(scroller);
      service.setAutoScroll(autoScroll);
      expect(lastState()).toEqual(
        expect.objectContaining({ autoScroll, collapsed: false })
      );

      scrollTo(200);
      expect(lastState()).toEqual(
        expect.objectContaining({ autoScroll, collapsed: true })
      );

      // Closing auto-scroll brings the bars back.
      service.setAutoScroll(null);
      expect(lastState()).toEqual(
        expect.objectContaining({ autoScroll: null, collapsed: false })
      );
    });

    // Before, auto-scroll's own scrolling left them up the whole time.
    it('hides them while auto-scroll plays, and brings them back on pause', () => {
      const autoScroll = {
        playing: false,
        speedLabel: '1',
        speedAccessibilityLabel: '1 linha por segundo',
        canSlower: true,
        canFaster: true,
        canPlay: true,
      };
      service.trackScroll(scroller);
      service.setAutoScroll(autoScroll);
      expect(collapsed()).toBe(false);

      service.setAutoScroll({ ...autoScroll, playing: true });
      expect(collapsed()).toBe(true);
      // A new speed while playing leaves them as they are.
      service.setAutoScroll({
        ...autoScroll,
        playing: true,
        speedLabel: '2',
        speedAccessibilityLabel: '2 linhas por segundo',
      });
      expect(collapsed()).toBe(true);

      service.setAutoScroll({ ...autoScroll, playing: false });
      expect(collapsed()).toBe(false);
    });

    // Opening a footnote's reference scrolls to its verse.
    it('leaves them alone when the page scrolls itself', () => {
      service.trackScroll(scroller);
      scroller.scrollTop = 600;
      scroller.dispatchEvent(new Event('scroll'));
      expect(collapsed()).toBe(false);

      // And measures the reader's next scroll from where it landed.
      scrollTo(600 + COLLAPSE_DISTANCE - 1);
      expect(collapsed()).toBe(false);
      scrollTo(600 + COLLAPSE_DISTANCE);
      expect(collapsed()).toBe(true);
    });

    describe('a tap on the text', () => {
      let line: HTMLElement;
      let link: HTMLAnchorElement;
      let asterisk: HTMLElement;
      let stop: () => void;

      beforeEach(() => {
        const content = scroller.firstElementChild as HTMLElement;
        content.innerHTML = `
          <p class="line">No princípio havia o Verbo</p>
          <a href="/jhn/1">Jo 1,1</a>
          <span role="button" class="footnoteIndicator">＊</span>`;
        line = content.querySelector('.line') as HTMLElement;
        link = content.querySelector('a') as HTMLAnchorElement;
        link.addEventListener('click', (event) => event.preventDefault());
        asterisk = content.querySelector('[role=button]') as HTMLElement;
        stop = service.trackScroll(scroller);
      });

      it('shows the hidden bars, and a second tap hides them', () => {
        scrollTo(200);
        expect(collapsed()).toBe(true);

        line.click();
        expect(collapsed()).toBe(false);
        line.click();
        expect(collapsed()).toBe(true);
      });

      it('leaves taps on links and asterisks to them', () => {
        link.click();
        asterisk.click();
        expect(collapsed()).toBe(false);
      });

      it('leaves a tap that only dismisses a selection', () => {
        doc['getSelection'] = () => ({ isCollapsed: false });
        line.dispatchEvent(new Event('pointerdown', { bubbles: true }));
        line.click();
        expect(collapsed()).toBe(false);
      });

      it('stops once tracking stops', () => {
        stop();
        line.click();
        expect(collapsed()).toBe(false);
      });
    });

    // Material's bars follow the scrolling: a tap that hid or showed them
    // would fight it. Only pages, which don't scroll, need the tap.
    // Material's bars follow the scrolling, but re-reading a line popped the
    // bar over the text, and older readers didn't think to scroll up.
    describe('in the Android app', () => {
      let line: HTMLElement;
      let now: number;

      beforeEach(() => {
        TestBed.resetTestingModule();
        TestBed.configureTestingModule({
          providers: [
            { provide: NATIVE_CHROME_PLUGIN, useValue: plugin },
            { provide: DOCUMENT, useValue: doc },
            {
              provide: OverlayContainer,
              useValue: { getContainerElement: () => overlays },
            },
          ],
        });
        (Capacitor.getPlatform as Mock).mockReturnValue('android');
        now = 10000;
        vi.spyOn(performance, 'now').mockImplementation(() => now);
        service = TestBed.inject(NativeChromeService);
        service.init();
        service.show(READER);
        const content = scroller.firstElementChild as HTMLElement;
        content.innerHTML = `<p class="line">No princípio havia o Verbo</p>`;
        line = content.querySelector('.line') as HTMLElement;
      });

      /** A finger's scroll to `top`, taking `ms` (a slow drag, unless said). */
      const drag = (top: number, ms = 200) => {
        now += ms;
        scroller.dispatchEvent(new Event('touchmove'));
        scroller.scrollTop = top;
        scroller.dispatchEvent(new Event('scroll'));
      };

      it('hides them after a line and a bit down, not one line', () => {
        service.trackScroll(scroller);
        drag(ANDROID_HIDE_DISTANCE - 8);
        expect(collapsed()).toBe(false);
        drag(ANDROID_HIDE_DISTANCE);
        expect(collapsed()).toBe(true);
      });

      it('brings them back after two lines up, not one', () => {
        service.trackScroll(scroller);
        drag(100);
        drag(400);
        expect(collapsed()).toBe(true);
        drag(400 - 30);
        expect(collapsed()).toBe(true);
        drag(400 - ANDROID_REVEAL_DISTANCE);
        expect(collapsed()).toBe(false);
      });

      it('brings them back at once on a flick up', () => {
        service.trackScroll(scroller);
        drag(100);
        drag(400);
        // 30 px in 10 ms: 3 px/ms, past FLING_REVEAL_SPEED.
        drag(370, 10);
        expect(30 / 10).toBeGreaterThanOrEqual(FLING_REVEAL_SPEED);
        expect(collapsed()).toBe(false);
      });

      // Voice Access, a keyboard or a switch scrolls without a finger.
      it("brings them back on a scroll up that is no finger's", () => {
        service.trackScroll(scroller);
        drag(100);
        drag(400);
        now += 5000;
        scroller.scrollTop = 390;
        scroller.dispatchEvent(new Event('scroll'));
        expect(collapsed()).toBe(false);
      });

      it('shows them on a tap, which never hides them', () => {
        service.trackScroll(scroller);
        drag(100);
        drag(400);
        expect(collapsed()).toBe(true);

        line.click();
        expect(collapsed()).toBe(false);
        line.click();
        expect(collapsed()).toBe(false);
      });

      it('leaves them hidden on a tap while auto-scroll reads on', () => {
        service.trackScroll(scroller);
        service.setAutoScroll({
          playing: true,
          speedLabel: '1',
          speedAccessibilityLabel: '1 linha por segundo',
          canSlower: true,
          canFaster: true,
          canPlay: true,
        });
        expect(collapsed()).toBe(true);
        line.click();
        expect(collapsed()).toBe(true);
      });

      it("still shows and hides them in pages, which don't scroll", () => {
        const content = scroller.firstElementChild as HTMLElement;
        content.style.height = '50px';
        service.trackScroll(scroller);

        line.click();
        expect(collapsed()).toBe(true);
        line.click();
        expect(collapsed()).toBe(false);
      });
    });

    it("never hides the search page's bars", () => {
      service.trackScroll(scroller);
      scrollTo(200);
      service.show(SEARCH);

      expect(collapsed()).toBe(false);
    });
  });

  describe('where the reader is, in the Android app', () => {
    let scroller: HTMLElement;
    let content: HTMLElement;
    let service: NativeChromeService;
    let stop: () => void;

    /** The shell's bars end 116 px down (setState's answer above). */
    beforeEach(async () => {
      doc['defaultView'] = window;
      // Laid out, and inside the <html> the document's listeners are on.
      document.body.appendChild(root);
      scroller = document.createElement('div');
      scroller.style.cssText =
        'position: fixed; top: 0; left: 0; width: 200px; height: 300px; overflow-y: scroll';
      content = document.createElement('div');
      content.innerHTML = `
        <div style="height: 150px"></div>
        <h3 data-section-heading style="height: 20px; margin: 0">O Verbo fez-se homem</h3>
        <div style="height: 500px"></div>
        <p style="height: 20px; margin: 0">
          <span data-section-heading>O testemunho de João</span> (Mt 3,1-12)
        </p>
        <div style="height: 2000px"></div>`;
      scroller.appendChild(content);
      root.appendChild(scroller);
      service = create('android');
      service.show(READER);
      await settle();
      stop = service.trackScroll(scroller);
    });

    afterEach(() => {
      stop();
      root.remove();
    });

    /** Past the 20-a-second limit on working out where the reader is, and a frame. */
    const frame = () =>
      new Promise<void>((resolve) =>
        setTimeout(() => requestAnimationFrame(() => resolve()), 60)
      );
    const scrollTo = async (top: number) => {
      scroller.scrollTop = top;
      scroller.dispatchEvent(new Event('scroll'));
      await frame();
    };
    const progress = () => vi.mocked(plugin.setProgress).mock.lastCall[0].value;

    it('sends how far through the chapter the text has scrolled', async () => {
      await frame();
      expect(progress()).toBe(0);
      const end = scroller.scrollHeight - scroller.clientHeight;
      await scrollTo(end / 2);
      expect(progress()).toBe(0.5);
      await scrollTo(end);
      expect(progress()).toBe(1);
    });

    it('follows the pages across, in paged view', async () => {
      const pages = document.createElement('div');
      pages.style.cssText = 'width: 200px; overflow-x: scroll';
      pages.innerHTML = `<div style="width: 1000px; height: 10px"></div>`;
      content.replaceChildren(pages);
      pages.scrollLeft = 200;
      pages.dispatchEvent(new Event('scroll'));
      await frame();
      expect(progress()).toBe(0.25);
    });

    // Génesis 1 and 2 overhang the reader's width by a few pixels: the line
    // read that sideways scroll, which never moved, and stayed at 0.
    it('follows the text down when it also overhangs a few pixels across', async () => {
      scroller.style.overflowX = 'scroll';
      content.style.width = '203px';
      const end = scroller.scrollHeight - scroller.clientHeight;
      expect(scroller.scrollWidth - scroller.clientWidth).toBeGreaterThan(1);
      await scrollTo(end / 2);
      expect(progress()).toBe(0.5);
    });

    it('shows the heading of the section that went up under the bar', async () => {
      await frame();
      expect(lastState().subtitle).toBeNull();

      // The first heading's bottom (150 + 20 − 100) is above the bar's edge.
      await scrollTo(100);
      expect(lastState().subtitle).toBe('O Verbo fez-se homem');

      await scrollTo(700);
      expect(lastState().subtitle).toBe('O testemunho de João');

      await scrollTo(0);
      expect(lastState().subtitle).toBeNull();
    });

    it('sends the heading once per section, not per scroll', async () => {
      await scrollTo(100);
      const calls = vi.mocked(plugin.setState).mock.calls.length;
      await scrollTo(120);
      await scrollTo(140);
      expect(vi.mocked(plugin.setState).mock.calls.length).toBe(calls);
    });

    it("sends the page's colour for the bars to match", async () => {
      root.style.setProperty('--background-color', '#121212');
      service.show({ ...READER, themeMode: 'dark' });
      expect(lastState().pageColor).toBe('#121212');
    });

    // In "Automático", the system's switch to dark turned the page dark
    // under bars that kept the light page's colour: a title the colour of
    // its bar, until the next scroll.
    it("sends the page's colour again when the theme changes under it", async () => {
      root.style.setProperty('--background-color', '#121212');
      root.classList.add('dark-theme');
      await settle();
      expect(lastState().pageColor).toBe('#121212');
    });

    it('takes the line and the heading away when tracking stops', async () => {
      await scrollTo(100);
      stop();
      expect(progress()).toBeNull();
      service.show(READER);
      expect(lastState().subtitle).toBeNull();
    });

    it("isn't followed in the iOS app", async () => {
      stop();
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        providers: [
          { provide: NATIVE_CHROME_PLUGIN, useValue: plugin },
          { provide: DOCUMENT, useValue: doc },
          {
            provide: OverlayContainer,
            useValue: { getContainerElement: () => overlays },
          },
        ],
      });
      (Capacitor.getPlatform as Mock).mockReturnValue('ios');
      const ios = TestBed.inject(NativeChromeService);
      ios.init();
      ios.show(READER);
      plugin.setProgress.mockClear();
      stop = ios.trackScroll(scroller);
      await scrollTo(700);
      expect(plugin.setProgress).not.toHaveBeenCalled();
      expect(lastState().subtitle).toBeNull();
    });
  });

  // "Voltar para …" covered a line of text for as long as one read on.
  describe('the way back after following a reference, in the Android app', () => {
    let page: HTMLElement;
    let service: NativeChromeService;
    let now: number;

    beforeEach(() => {
      doc['defaultView'] = window;
      page = document.createElement('div');
      root.appendChild(page);
      now = 1000;
      vi.spyOn(performance, 'now').mockImplementation(() => now);
      service = create('android');
      service.show(READER);
    });

    afterEach(() => page.remove());

    const scrollTo = (top: number) => {
      Object.defineProperty(page, 'scrollTop', {
        value: top,
        configurable: true,
      });
      page.dispatchEvent(new Event('scroll'));
    };

    it("goes once the reader has read on a screen's height", () => {
      service.toast('Voltar para Mateus 5,3', {
        onTap: () => {},
        returnToPage: true,
      });
      now += 2000;
      scrollTo(100);
      scrollTo(100 + window.innerHeight - 1);
      expect(plugin.hideToast).not.toHaveBeenCalled();
      scrollTo(100 + window.innerHeight);
      expect(plugin.hideToast).toHaveBeenCalledTimes(1);
    });

    // The reader lands on the verse as the toast shows: the app's scroll.
    it('leaves it up while the reader lands on the passage', () => {
      service.toast('Voltar para Mateus 5,3', {
        onTap: () => {},
        returnToPage: true,
      });
      scrollTo(5000);
      now += 2000;
      scrollTo(5000 + window.innerHeight - 1);
      expect(plugin.hideToast).not.toHaveBeenCalled();
    });

    // Only the way back goes as the reader reads on: another toast with an
    // action stays until it is used, closed or replaced.
    it('leaves another toast with an action up', () => {
      service.toast('Marcador movido', { onTap: () => {} });
      now += 2000;
      scrollTo(0);
      scrollTo(window.innerHeight * 2);
      expect(plugin.hideToast).not.toHaveBeenCalled();
    });

    it('leaves a plain toast to its own timing', () => {
      service.toast('Copiado');
      now += 2000;
      scrollTo(0);
      scrollTo(window.innerHeight * 2);
      expect(plugin.hideToast).not.toHaveBeenCalled();
    });
  });

  // styles.css: the iOS app has no accent colour, and the web controls it still
  // shows (the report dialog's fields and buttons) must not keep the brown.
  describe('colours left to the web in the iOS app', () => {
    const BROWN = /#543d27|rgb\(84, 61, 39\)/i;
    const tokens = [
      '--cap-brown',
      '--mat-form-field-focus-color',
      '--mat-form-field-filled-focus-active-indicator-color',
      '--mat-button-filled-container-color',
    ];
    let host: HTMLElement;

    beforeEach(() => {
      host = document.createElement('div');
      document.body.appendChild(host);
    });
    afterEach(() => {
      host.remove();
      document.body.classList.remove(
        'native-chrome',
        'platform-ios',
        'platform-android'
      );
    });

    it('are brown on the web', () => {
      expect(getComputedStyle(host).getPropertyValue('--cap-brown')).toMatch(
        BROWN
      );
    });

    it('are the text colour in the iOS app', () => {
      document.body.classList.add('native-chrome', 'platform-ios');
      for (const token of tokens) {
        const value = getComputedStyle(host).getPropertyValue(token).trim();
        expect(value, token).not.toMatch(BROWN);
        expect(value, token).toBe(
          getComputedStyle(host).getPropertyValue('--text-color').trim()
        );
      }
    });

    // Its Material bars are the website's brown too.
    it('stay brown in the Android app', () => {
      document.body.classList.add('native-chrome', 'platform-android');
      expect(getComputedStyle(host).getPropertyValue('--cap-brown')).toMatch(
        BROWN
      );
    });
  });
});
