# ALAS v3 Frontend — Windows Server / IIS Deployment Guide

Target: Windows Server + IIS hosting the React SPA as static files, with the
ASP.NET Core .NET 10 Web API on the same origin under `/api/*` (ARR reverse
proxy) or a separate internal host.

> Status: **configuration prepared, not executed.** No Windows Server was
> available in the build environment; every step below is documented for the
> operations team and must be validated on the real host (see §7).

## 1. Prerequisites

- Windows Server 2019/2022, IIS 10 with **Static Content**, **Default
  Documents** (not required but harmless), and the **URL Rewrite** module.
- For same-origin `/api/*`: **ARR 3.x + URL Rewrite** (proxy) or a DNS/host
  split that routes `/api` to the API host.
- TLS certificate bound (HTTPS-only; HSTS recommended at the edge).
- Build machine (any OS) with Node ≥ 20.19 and npm ≥ 11.

## 2. Build

```bash
npm ci
npm run typecheck && npm run lint && npm test
npm run build          # outputs dist/
```

Verify the artifact before deploying:

```bash
# must print nothing (no mock worker, no mock code, no demo credentials)
grep -rl "mockServiceWorker\|__alasMock\|Passw0rd" dist/
```

The production bundle is mock-free by construction:
`VITE_ENABLE_MOCK_API=false` (`.env.production`) plus a compile-time gate
(`__ALAS_MOCKS__`) that dead-code-eliminates every mock module, and a build
plugin that deletes any stray `mockServiceWorker.js` from `dist/`.

## 3. Deploy

1. Copy the **contents** of `dist/` into the site root (e.g.
   `C:\inetpub\wwwroot\alas\`).
2. Copy `web.config` from the repository root next to `index.html`.
3. Recycle the application pool (no .NET runtime is needed for the SPA pool;
   use *No Managed Code*).
4. Keep the previous release folder (e.g. `..\releases\<date>`) for rollback.

### Environment configuration

The SPA reads its API base from the build-time variable
`VITE_API_BASE_URL`. For the recommended same-origin layout leave it empty
and let IIS/ARR proxy `/api/*` to the .NET API:

```
https://host/            -> dist/index.html + assets
https://host/api/*       -> ARR -> http://api-internal:port/api/*
```

If a separate API origin is unavoidable, produce a dedicated build with
`VITE_API_BASE_URL=https://api.internal` and ensure CORS allows only the SPA
origin with credentials as designed by the backend team.

## 4. What web.config provides

- **SPA fallback**: deep links (`/login`, `/monitoring`, `/loans/123/print`,
  `/admin/workflow`, …) rewrite to `/index.html`; real files and `/api/*`
  are excluded.
- **Security headers**: CSP (`default-src 'self'`, `frame-ancestors 'none'`,
  `object-src 'none'`), `X-Content-Type-Options`, `X-Frame-Options`,
  `Referrer-Policy`, `Permissions-Policy`; `X-Powered-By` removed.
- **Caching policy**: `index.html` and root static content revalidate every
  request; `/assets/*` (hashed filenames) serve `immutable, max-age=1y`.
- **Defense in depth**: serving `mockServiceWorker.js` is denied even if a
  stale copy lands on the server.
- **MIME**: IIS 10 already knows `.woff2`, `.svg`, `.json`; no additions needed.

## 5. Backend-side requirements (not frontend configuration)

- `Cache-Control: no-store` on all authenticated JSON responses (account,
  loans, queues, workflow config, notifications). Frontend cache invalidation
  cannot compensate for proxy/browser caching of sensitive data.
- Auth cookies: `HttpOnly; Secure; SameSite=Lax` (or Strict) + CSRF protection
  per the .NET contract; the SPA sends `credentials: same-origin` by default.
- Security headers for `/api/*` responses remain the API's responsibility.

## 6. Rollback

1. Point the site physical path back to the previous release folder (or
   copy it over the site root).
2. Recycle the pool.
3. Because assets are content-hashed and `index.html` is never cached
   long-term, clients pick the rolled-back entry document on next load.

## 7. Post-deployment smoke tests (run on the server or an internal client)

1. `GET /` → login screen; **no** demo-credentials panel; dev scenario
   switcher absent.
2. `GET /monitoring` (unauthenticated) → redirects to `/login`.
3. Sign in → dashboard renders live data from the API (network tab shows
   `/api/dashboard/overview` 200, not mock responses).
4. Refresh on `/loans/<id>` → page loads (SPA fallback works).
5. `GET /api/loans` directly → JSON from the API (NOT `index.html`).
6. Response headers include the CSP and `X-Content-Type-Options`.
7. `GET /assets/*.js` → `Cache-Control: public, max-age=31536000, immutable`;
   `GET /` → no-store/revalidate.
8. `GET /mockServiceWorker.js` → 404.
9. Expire a session server-side → next action returns to login with the
   "Session ended" notice.

## 8. Common failures

| Symptom | Cause / fix |
| --- | --- |
| Deep link 404 | URL Rewrite module missing or `<rewrite>` removed |
| API calls return HTML | Rewrite rule missing the `/api` exclusion |
| Users stuck on old release | `index.html` cached upstream — verify `DisableCache` and edge/proxy settings |
| Fonts 404 after deploy | `/assets` folder not copied (hashed sub-resources) |
| Login works, data 401s | Cookie `SameSite`/HTTPS mismatch between SPA and API origins |
