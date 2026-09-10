import { appConfig } from "../config"

/**
 * Vercel Speed Insights only works where Vercel serves the site: its loader
 * requests /_vercel/speed-insights/script.js, which the nginx production host
 * answers with a 404 — and a console error on every page load. Inject it only
 * on the Vercel deployment.
 */
export function isVercelHost(hostname: string): boolean {
  return (
    hostname === appConfig.fallbackDomain || hostname.endsWith(".vercel.app")
  )
}
