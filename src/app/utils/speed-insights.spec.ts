import { appConfig } from "../config"
import { isVercelHost } from "./speed-insights"

describe("isVercelHost", () => {
  it("recognises the Vercel fallback deployment", () => {
    expect(isVercelHost(appConfig.fallbackDomain)).toBeTrue()
  })

  it("recognises Vercel preview deployments", () => {
    expect(isVercelHost("bible-app-git-feature-branch.vercel.app")).toBeTrue()
  })

  // Production is served by nginx, where the Speed Insights script is a 404.
  it("rejects the production host", () => {
    expect(isVercelHost(appConfig.domain)).toBeFalse()
  })

  it("rejects local development", () => {
    expect(isVercelHost("localhost")).toBeFalse()
  })
})
