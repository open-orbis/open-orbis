// Cloudflare Pages Advanced Mode worker.
// Keeps the app same-origin on open-orbis.com: backend paths are reverse-proxied
// to the OVH backend; everything else is served as static assets with SPA
// fallback. This mirrors the old Firebase Hosting rewrites the backend OAuth
// discovery was written for (endpoints advertised on the frontend origin).

const BACKEND = "https://api.open-orbis.com";

// Exact backend paths to proxy (JSON OAuth endpoints + RFC 8414 discovery).
// NOTE: /oauth/authorize is intentionally NOT here — it is the SPA consent page.
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

    if (shouldProxy(url.pathname)) {
      const headers = new Headers(request.headers);
      headers.delete("host"); // let fetch set the backend Host
      const init = {
        method: request.method,
        headers,
        redirect: "manual",
      };
      if (request.method !== "GET" && request.method !== "HEAD") {
        init.body = request.body;
      }
      return fetch(BACKEND + url.pathname + url.search, init);
    }

    // Static assets, with SPA fallback for client-side routes.
    const res = await env.ASSETS.fetch(request);
    if (
      res.status === 404 &&
      request.method === "GET" &&
      (request.headers.get("accept") || "").includes("text/html")
    ) {
      return env.ASSETS.fetch(new Request(new URL("/index.html", url), request));
    }
    return res;
  },
};
