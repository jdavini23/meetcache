<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

# Cache

Cache is a passwordless AI parenting coach that retains a parent-provided child context. The landing page lives at `/`; the product lives at `/app`.

## Run Locally

**Prerequisites:** Node.js, a Supabase project, and a Gemini API key.

1. Install dependencies: `npm install`
2. Copy `.env.example` to `.env.local` and set every value.
3. Apply the SQL migrations in `supabase/migrations/` to your Supabase project.
4. In Supabase Auth, enable Email sign-in and add `http://localhost:3000/app` plus your production `/app` URL to **Redirect URLs**.
5. Start the API in one terminal: `npm run dev:api`
6. Start Vite in another terminal: `npm run dev`

For production, `npm run build` compiles both the client and API into `dist/`.
Run the combined server with `npm start` (or `npm run preview`). Do not deploy the
Vite static bundle by itself: account and chat actions require the Express API.

## Testing

- `npm test` runs unit, component, and mocked API tests.
- `npm run test:e2e` runs the Chromium browser smoke tests.
- `npm run test:all` runs both suites.

The test suite uses mocked Supabase and Gemini responses, so it does not require local secrets or access to production services.

## Security notes

- `VITE_SUPABASE_*` values are intentionally browser-visible. `SUPABASE_SERVICE_ROLE_KEY` and `GEMINI_API_KEY` must only be available to `server.ts`.
- `GEMINI_MODEL` defaults to `gemini-3.6-flash`, so the server model can be updated without changing application code.
- Chat generation defaults to 10 attempts per user per 60 seconds. Configure
  `CHAT_RATE_LIMIT_MAX` and `CHAT_RATE_LIMIT_WINDOW_SECONDS` to change that
  durable database-backed limit.
- Each account is also limited to 100 response attempts per UTC day by default.
  Configure `CHAT_DAILY_LIMIT_MAX` to adjust that cost ceiling.
- Pending requests older than `CHAT_REQUEST_STALE_SECONDS` (90 seconds by
  default) can be reclaimed safely after an interrupted server request.
- The chat endpoint verifies a Supabase access token, reads the caller's profile, and persists messages server-side. Database row-level security keeps browser access scoped to its owner.
- `GET /healthz` is the process liveness endpoint. `GET /readyz` also checks
  Supabase connectivity and returns `503` when Cache cannot safely serve chat.
- Authenticated parents can download a versioned JSON export at
  `GET /api/account/export`, or permanently delete their account at
  `DELETE /api/account`. Account deletion revokes refresh sessions before
  deleting the Supabase Auth user; the existing foreign-key cascades remove
  application data immediately. Provider backups follow their normal
  retention lifecycle.
- Set `SENTRY_DSN` and `VITE_SENTRY_DSN` to enable sanitized server and browser
  error reporting. Cache removes request bodies, headers, cookies, and user
  data before reporting events. Monitor `/readyz` and create an alert for
  repeated `chat_request_failed`, `readiness_failed`, or `safety_handoff`
  events; never add prompts or profile data to operational logs.
