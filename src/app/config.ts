import { Capacitor } from "@capacitor/core"

export const appConfig = {
  domain: "biblia.capuchinhos.org",
  fallbackDomain: "bible-app-ten-psi.vercel.app",
}

/**
 * Origin used for API calls while server-rendering (prerender builds).
 * PRERENDER_API_ORIGIN lets CI or local test runs point at a stub server.
 */
export const serverApiOrigin =
  (globalThis as { process?: { env?: Record<string, string | undefined> } })
    .process?.env?.["PRERENDER_API_ORIGIN"] || `https://${appConfig.domain}`

export const apiBaseUrl = Capacitor.isNativePlatform()
  ? `https://${appConfig.domain}/v1`
  : typeof window === "undefined"
    ? `${serverApiOrigin}/v1`
    : "v1"
