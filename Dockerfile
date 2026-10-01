# syntax=docker/dockerfile:1

# ---- build: Angular production build with prerendered pages -----------------
FROM node:26-slim AS build
WORKDIR /app

# Chromium is only needed by the test runner, never by the build.
ENV PUPPETEER_SKIP_DOWNLOAD=true

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# The prerender reads the book list from a live API. Strict mode makes an
# unreachable API fail this build (the running version keeps serving) instead
# of shipping client-rendered shells. Render forwards service env vars as build
# args, so PRERENDER_API_ORIGIN can be set there; unset, it defaults to the
# production domain.
ARG PRERENDER_API_ORIGIN
ENV PRERENDER_API_ORIGIN=$PRERENDER_API_ORIGIN \
    PRERENDER_STRICT=true
RUN npm run build

# ---- runtime: static files behind nginx -------------------------------------
FROM nginx:1.28-alpine AS runtime

# Render routes traffic to $PORT (default 10000). The entrypoint renders
# /etc/nginx/templates/*.template with the container's env, and exposes the
# container's DNS resolvers as NGINX_LOCAL_RESOLVERS.
ENV PORT=10000 \
    NGINX_ENTRYPOINT_LOCAL_RESOLVERS=1

COPY --chmod=755 nginx/10-api-origin.envsh /docker-entrypoint.d/10-api-origin.envsh
COPY nginx/security-headers.conf /etc/nginx/snippets/security-headers.conf
COPY nginx/default.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist/bible-app/browser /usr/share/nginx/html

EXPOSE 10000

# Shows up as "healthy" in `docker ps`; Render uses its own healthCheckPath.
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD wget -qO- "http://127.0.0.1:${PORT}/healthz" >/dev/null || exit 1
