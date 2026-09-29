import { TestBed } from "@angular/core/testing"
import { BackButtonService } from "./back-button.service"

describe("BackButtonService", () => {
  let service: BackButtonService

  beforeEach(() => {
    service = TestBed.inject(BackButtonService)
  })

  it("reports that nothing was closed with no closers", () => {
    expect(service.closeTopmost()).toBeFalse()
  })

  it("tries the most recently registered closer first", () => {
    const calls: string[] = []
    service.register(() => {
      calls.push("drawer")
      return true
    })
    service.register(() => {
      calls.push("menu")
      return true
    })

    expect(service.closeTopmost()).toBeTrue()
    expect(calls).toEqual(["menu"])
  })

  it("falls through closers that had nothing open", () => {
    const drawer = jasmine.createSpy("drawer").and.returnValue(true)
    service.register(drawer)
    service.register(() => false)

    expect(service.closeTopmost()).toBeTrue()
    expect(drawer).toHaveBeenCalled()
  })

  it("stops calling a closer once unregistered", () => {
    const closer = jasmine.createSpy("closer").and.returnValue(true)
    const unregister = service.register(closer)

    unregister()

    expect(service.closeTopmost()).toBeFalse()
    expect(closer).not.toHaveBeenCalled()
  })
})
