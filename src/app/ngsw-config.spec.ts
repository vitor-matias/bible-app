import config from "../../ngsw-config.json"

// What the service worker keeps, and with which version of the code.
describe("ngsw-config.json", () => {
  it("caches build-info.json with the code it describes", () => {
    const app = config.assetGroups.find((group) => group.name === "app")
    expect(app?.installMode).toBe("prefetch")
    expect(app?.resources.files).toContain("/build-info.json")
  })

  // What was searched would stay on disk; searches bypass the worker.
  it("has no data group for searches", () => {
    expect(config.dataGroups.flatMap((group) => group.urls)).not.toContain(
      "/v1/search**",
    )
  })
})
