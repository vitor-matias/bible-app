// Runs before every spec file. Jasmine removed each spyOn and gave each fakeAsync
// spec its own clock; Vitest does neither, so a spec's spies, stubbed globals
// and fake timers would otherwise leak into the next one.
afterEach(() => {
  // Spies first: one made while the clock was faked has the fake as its
  // original, and restoring it after the real clock is back would put it back.
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})
