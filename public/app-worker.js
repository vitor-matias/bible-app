// The app's service worker: Angular's (ngsw-worker.js), minus requests that
// aren't for the app itself. Listeners run in the order they were added, so
// this one goes first and lets the network answer those, as if there were no
// worker at all.
//
// Why: Angular's worker fetches every request itself and answers a failure
// with its own 504. The +365 audio streams from the podcast's host, and
// Safari's media engine re-requests the redirected file in ranges, straight
// to its CDN; through the worker each of those failed.
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url)
  if (
    url.origin !== self.location.origin ||
    event.request.destination === "audio"
  ) {
    event.stopImmediatePropagation()
  }
})

importScripts("./ngsw-worker.js")
