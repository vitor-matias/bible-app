import { defineConfig } from "vitest/config"

// Merged into the config that @angular/build:unit-test generates.
export default defineConfig({
  test: {
    // One spec file at a time, as Karma ran them. Concurrent files share the
    // origin's IndexedDB, localStorage and rendering time, and the specs read
    // real layout, requestAnimationFrame and observers.
    fileParallelism: false,
  },
})
