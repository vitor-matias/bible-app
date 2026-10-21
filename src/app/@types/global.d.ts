declare global {
  var umami:
    | {
        track: (eventName: string, data?: Record<string, unknown>) => void
      }
    | undefined
  // Named by data-before-send on the Umami script tag in index.html.
  var umamiBeforeSend:
    | ((
        type: string,
        payload: import("../services/analytics.service").UmamiPayload,
      ) => import("../services/analytics.service").UmamiPayload)
    | undefined
}

export {}
