import { DOCUMENT, inject } from "@angular/core"
import type { CanActivateFn } from "@angular/router"

export const PLAY_STORE_URL =
  "https://play.google.com/store/apps/details?id=org.capuchinhos.biblia"
export const APP_STORE_URL =
  "https://apps.apple.com/pt/app/b%C3%ADblia-sagrada-capuchinhos/id6823135142"

/**
 * Sends the `/android` and `/ios` short links to the store listing when the
 * app answers them instead of nginx: a browser whose service worker serves
 * the cached app, or the Android app, which opens every link to the site.
 */
export const redirectTo =
  (url: string): CanActivateFn =>
  () => {
    inject(DOCUMENT).location.replace(url)
    return false
  }
