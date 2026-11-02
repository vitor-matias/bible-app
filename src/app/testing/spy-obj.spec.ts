import type { Mock } from "vitest"
import { createSpyObj, lastCall } from "./spy-obj"

describe("createSpyObj", () => {
  it("makes each named method a mock that records its calls", () => {
    const spy = createSpyObj("Greeter", ["hello", "bye"])

    spy.hello.mockReturnValue("hi")

    expect(spy.hello("Ana")).toBe("hi")
    expect(spy.hello).toHaveBeenCalledWith("Ana")
    expect(spy.bye).not.toHaveBeenCalled()
  })

  it("serves each prop through a getter that a spec can change", () => {
    const spy = createSpyObj<{ mode: string }>("Theme", [], { mode: "light" })
    expect(spy.mode).toBe("light")

    const getter = Object.getOwnPropertyDescriptor(spy, "mode")?.get as Mock
    getter.mockReturnValue("dark")

    expect(spy.mode).toBe("dark")
  })
})

describe("lastCall", () => {
  it("returns the arguments of the latest call", () => {
    const spy = vi.fn()
    spy(1, "a")
    spy(2, "b")

    expect(lastCall(spy)).toEqual([2, "b"])
  })

  it("throws when the mock was never called", () => {
    expect(() => lastCall(vi.fn())).toThrow("to have been called")
  })
})
