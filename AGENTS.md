# Repository Guidelines

## Project Structure & Module Organization

Cache is a React 19 and TypeScript application with a Vite/Tailwind CSS 4 client and an Express API. `src/main.tsx` mounts the app; `src/App.tsx` routes between the landing page and product; and `src/index.css` defines shared theme tokens. Keep UI sections and product components in `src/components/`, shared browser logic and types in `src/lib/`, and test setup in `src/test/`. The API entry point and its tests live at the repository root in `server.ts` and `server.test.ts`. Browser smoke tests live in `e2e/`, while ordered Supabase schema changes belong in `supabase/migrations/`. Generated `dist/` output must not be committed.

## Build, Test, and Development Commands

- `npm install` installs dependencies; keep `package-lock.json` and `bun.lock` synchronized when dependencies change.
- `npm run dev` starts Vite on port 3000 and exposes it on the local network.
- `npm run dev:api` starts the Express API on port 3001; run it alongside `npm run dev` for local product work.
- `npm run lint` runs TypeScript validation with `tsc --noEmit`.
- `npm test` runs the Vitest unit, component, and mocked API suites.
- `npm run test:api` runs only the API tests; `npm run test:e2e` runs Playwright browser smoke tests.
- `npm run build` builds the Vite client and bundles the Express server into `dist/`.
- `npm start` or `npm run preview` serves the combined production application.
- `npm run clean` removes generated build artifacts.

Before submitting changes, run `npm run lint && npm test && npm run build`. Run `npm run test:e2e` for changes that affect browser flows, routes, or visual interactions.

## Coding Style & Naming Conventions

Use TypeScript and functional React components. Follow the existing two-space indentation, semicolons, and single-quoted imports. Name components in PascalCase (`FinalCTA.tsx`), variables and handlers in camelCase (`handleSubmit`), and props interfaces as `<Component>Props`. Keep components focused; colocate their tests as `*.test.tsx` or `*.test.ts`. Use Tailwind utilities and define shared colors or fonts in `src/index.css`. No formatter or ESLint configuration exists, so avoid unrelated formatting churn.

## Testing Guidelines

Vitest is configured with jsdom, Testing Library, mocked Supabase/Gemini responses, and V8 coverage. Playwright provides Chromium browser smoke tests. Add unit and component tests beside the code they cover; add API coverage in `server.test.ts` and browser-flow coverage in `e2e/` when appropriate. Tests must not require production services or local secrets. Manually verify responsive layouts and the affected signed-in flows when automation cannot cover them.

## Commit & Pull Request Guidelines

Recent history uses short, imperative subjects and Conventional Commit prefixes (`feat: scaffold landing page application`). Use forms such as `fix: handle duplicate signup`. Pull requests should summarize changes, list validation performed, link issues, and include before/after screenshots for visual work. Call out schema or configuration dependencies.

## Security & Configuration

Copy `.env.example` to `.env.local` for local-only values; `.env*` files are ignored. Never commit service-role keys, Gemini keys, or other secrets. Only `VITE_*` browser configuration (including Supabase publishable values and the browser Sentry DSN) may be exposed to the client. Keep `SUPABASE_SERVICE_ROLE_KEY`, `GEMINI_API_KEY`, and server Sentry configuration in the Express environment. Privileged operations must remain protected by API authorization and Supabase row-level security; accompany schema changes with a new migration rather than editing an applied migration.
