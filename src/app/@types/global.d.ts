declare global {
  var umami:
    | {
        track: (eventName: string, data?: Record<string, unknown>) => void
      }
    | undefined
}

export {}
