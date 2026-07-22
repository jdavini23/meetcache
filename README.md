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

For production, build the client with `npm run build` and run the combined server with `npm start`.

## Security notes

- `VITE_SUPABASE_*` values are intentionally browser-visible. `SUPABASE_SERVICE_ROLE_KEY` and `GEMINI_API_KEY` must only be available to `server.ts`.
- `GEMINI_MODEL` defaults to `gemini-3.6-flash`, so the server model can be updated without changing application code.
- The chat endpoint verifies a Supabase access token, reads the caller's profile, and persists messages server-side. Database row-level security keeps browser access scoped to its owner.
