import type { Mock } from "vitest"

// biome-ignore lint/suspicious/noExplicitAny: matches Vitest's own Procedure type
type Fn = (...args: any[]) => any

/** T with its methods typed as Vitest mocks (the shape jasmine.SpyObj had). */
export type SpyObj<T> = T & {
  [K in keyof T]: T[K] extends Fn ? Mock<T[K]> : T[K]
}

/**
 * Vitest counterpart of `jasmine.createSpyObj`: an object whose `methods` are
 * `vi.fn()` mocks and whose `props` are getters backed by a mock too, so a spec
 * can change one later through its property descriptor. Typed as the SpyObj of
 * whatever it is assigned to, so it can be provided or assigned wherever the
 * real thing is expected; with no such target it is just the mocks.
 */
export function createSpyObj<T>(
  name: string,
  methods: readonly (keyof T & string)[],
  props?: Partial<T>,
): SpyObj<T>
export function createSpyObj<M extends string>(
  name: string,
  methods: readonly M[],
  props?: Record<string, unknown>,
): Record<M, Mock>
export function createSpyObj(
  name: string,
  methods: readonly string[],
  props: Record<string, unknown> = {},
): unknown {
  const obj: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(props)) {
    Object.defineProperty(obj, key, {
      get: vi.fn(() => value).mockName(`${name}.${key}`),
      enumerable: true,
      configurable: true,
    })
  }
  for (const method of methods) {
    obj[method] = vi.fn().mockName(`${name}.${method}`)
  }
  return obj
}

/** Arguments of a mock's latest call (jasmine's `calls.mostRecent().args`); throws if it was never called. */
export function lastCall<A extends unknown[]>(spy: {
  mock: { lastCall: A | undefined }
}): A {
  const args = spy.mock.lastCall
  if (!args) throw new Error("Expected the mock to have been called")
  return args
}
