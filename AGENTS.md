# Repository Guidelines

## Project Structure & Module Organization

This is a React 19 landing page built with TypeScript, Vite, and Tailwind CSS 4. In `src/`, `main.tsx` mounts the app, `App.tsx` composes page sections, and `index.css` defines theme tokens. Keep page sections in `src/components/` (for example, `Hero.tsx`) and shared integrations in `src/lib/`. Static assets belong in `assets/`. Generated `dist/` output must not be committed.

## Build, Test, and Development Commands

- `npm install` installs dependencies; keep `bun.lock` synchronized.
- `npm run dev` starts Vite on port 3000 and exposes it on the local network.
- `npm run lint` runs TypeScript validation with `tsc --noEmit`.
- `npm run build` creates the production bundle in `dist/`.
- `npm run preview` serves the production bundle locally.
- `npm run clean` removes generated build artifacts.

Before submitting changes, run `npm run lint && npm run build`.

## Coding Style & Naming Conventions

Use TypeScript and functional React components. Follow the existing two-space indentation, semicolons, and single-quoted imports. Name components in PascalCase (`FinalCTA.tsx`), variables and handlers in camelCase (`handleSubmit`), and props interfaces as `<Component>Props`. Prefer small, section-focused components. Use Tailwind utilities and define shared colors or fonts in `src/index.css`. No formatter or ESLint configuration exists, so avoid unrelated formatting churn.

## Testing Guidelines

No automated test framework or coverage threshold is configured. Treat type-checking and production builds as the baseline. Manually verify responsive layouts, navigation scrolling, waitlist validation, duplicate-email handling, error states, and the pricing survey. Place future tests beside modules as `*.test.tsx` and add the runner command to `package.json`.

## Commit & Pull Request Guidelines

Recent history uses short, imperative subjects and Conventional Commit prefixes (`feat: scaffold landing page application`). Use forms such as `fix: handle duplicate signup`. Pull requests should summarize changes, list validation performed, link issues, and include before/after screenshots for visual work. Call out schema or configuration dependencies.

## Security & Configuration

Copy `.env.example` to `.env.local` for local-only values; `.env*` files are ignored. Never commit service-role keys or other secrets. Supabase publishable keys may be client-visible, but privileged operations must remain protected by database policies or a server-side service.
