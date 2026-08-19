import { PrerenderFallback, RenderMode, type ServerRoute } from "@angular/ssr"
import { routes } from "./app.routes"
import { serverRoutes } from "./app.routes.server"
import { BibleReaderComponent } from "./components/bible-reader/bible-reader.component"

describe("server routes", () => {
  it("prerenders the home page so crawlers get real content at /", () => {
    const home = serverRoutes.find((route) => route.path === "")
    expect(home?.renderMode).toBe(RenderMode.Prerender)
  })

  it("keeps search client-rendered", () => {
    const search = serverRoutes.find((route) => route.path === "search")
    expect(search?.renderMode).toBe(RenderMode.Client)
  })

  it("prerenders the chapter routes", () => {
    const chapter = serverRoutes.find(
      (route) => route.path === ":book/:chapter",
    ) as Extract<ServerRoute, { renderMode: RenderMode.Prerender }> | undefined
    expect(chapter?.renderMode).toBe(RenderMode.Prerender)
    // Without the client fallback a build with no API data (or any book/chapter
    // pair the prerenderer did not see) would 404 instead of booting the SPA.
    expect(chapter?.fallback).toBe(PrerenderFallback.Client)
  })
})

describe("client routes", () => {
  // The server route for "" can only prerender if the client router also
  // resolves "" (the ** fallback alone is not a stable match for it).
  it("maps the home path to the reader", () => {
    const home = routes.find((route) => route.path === "")
    expect(home?.component).toBe(BibleReaderComponent)
    expect(home?.pathMatch).toBe("full")
  })
})
