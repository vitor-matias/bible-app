import type { Mock } from "vitest"

// biome-ignore lint/suspicious/noExplicitAny: matches Vitest's own Procedure type
type Fn = (...args: any[]) => any

/** T with its methods typed as Vitest mocks (the shape jasmine.SpyObj had). */
export type SpyObj<T> = T & {
  [K in keyof T]: T[K] extends Fn ? Mock<T[K]> : T[K]
}

/**
 * Vitest counterpart of `jasmine.createSpyObj`: an object whose `methods` are
 * `vi.fn()` mocks and whose `props` are plain values. Typed as the SpyObj of
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
  const obj: Record<string, unknown> = { ...props }
  for (const method of methods) {
    obj[method] = vi.fn().mockName(`${name}.${method}`)
  }
  return obj
}
