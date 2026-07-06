// Cloudflare Worker entry (Workers + Static Assets).
// Keeps the app same-origin on open-orbis.com: backend paths are reverse-proxied
// to the OVH backend; everything else is served from the built static assets
// (SPA fallback via assets.not_found_handling = "single-page-application").
//
// With `main` + `assets` configured and no run_worker_first, Cloudflare serves a
// matching static asset directly and only invokes this Worker on an asset miss —
// which is exactly the set of paths we need to handle (/api, the JSON OAuth
// endpoints, the discovery doc, and SPA routes like /oauth/authorize).

const BACKEND = "https://api.open-orbis.com";

// Exact backend paths to proxy (JSON OAuth endpoints + RFC 8414 discovery).
// /oauth/authorize is intentionally NOT here — it is the SPA consent page.
const PROXY_EXACT = new Set([
  "/.well-known/oauth-authorization-server",
  "/oauth/token",
  "/oauth/register",
  "/oauth/revoke",
]);

function shouldProxy(pathname) {
  return pathname.startsWith("/api/") || PROXY_EXACT.has(pathname);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Canonical host: 301 www -> apex (both are custom domains of this worker).
    if (url.hostname === "www.open-orbis.com") {
      url.hostname = "open-orbis.com";
      return Response.redirect(url.toString(), 301);
    }

    if (shouldProxy(url.pathname)) {
      const headers = new Headers(request.headers);
      headers.delete("host"); // let fetch set the backend Host
      const init = { method: request.method, headers, redirect: "manual" };
      if (request.method !== "GET" && request.method !== "HEAD") {
        init.body = request.body;
      }
      return fetch(BACKEND + url.pathname + url.search, init);
    }

    // Static assets + SPA fallback (handled by not_found_handling).
    return env.ASSETS.fetch(request);
  },
};
