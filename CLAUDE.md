# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- **Dev server:** `npm run dev` (uses Next.js with Turbopack)
- **Build:** `npm run build`
- **Lint:** `npm run lint`
- **Start production:** `npm run start`

No test framework is configured.

## Architecture

This is a **workout tracking PWA** built with Next.js 15 (App Router), React 19, TypeScript, and Tailwind CSS 4.

### Key layers

- **`src/app/page.tsx`** — Single-page app. All top-level state lives here (user, workouts, UI flags) and is passed down as props. No external state management library; everything uses React hooks.
- **`src/app/api/`** — RESTful API routes. Auth endpoints (`auth/login`, `auth/register`, `auth/logout`, `auth/me`), workout CRUD (`workouts/`, `workouts/[id]/`), and exercise helpers (`exercises/all`, `exercises/track`, `exercises/seed`).
- **`src/lib/auth.ts`** — Custom JWT auth using `jose`. Tokens stored in HTTP-only cookies.
- **`src/lib/db.ts`** — Direct SQL queries via `@vercel/postgres` (no ORM). Contains all database operations and table initialization.
- **`src/middleware.ts`** — Protects routes by validating JWT. Auth API routes are excluded.

### Database

PostgreSQL (Vercel Postgres / Neon). Four tables: `users`, `workouts`, `exercise_patterns`, `common_exercises`. Exercises are stored as JSONB in the workouts table. Schema is initialized in `db.ts`.

### Component patterns

- **`WorkoutForm.tsx`** — Complex form with @dnd-kit drag-and-drop, localStorage draft auto-save, and unsaved changes detection.
- **`ExerciseRow.tsx`** — Per-exercise input with autocomplete, per-set weight/reps, and effective reps toggle.
- **`useExerciseCache.ts`** — Hook that caches exercise autocomplete data in localStorage for 5 minutes.
- **UI primitives** in `src/components/ui/` are shadcn/ui (New York style, configured in `components.json`).

### Auth

Registration requires a `REGISTRATION_SECRET` env var (prevents open signup). JWT secret is in `JWT_SECRET`.

### PWA

Configured via `@ducanh2912/next-pwa` in `next.config.js`. Auth routes are excluded from service worker caching. Disabled in development.

### Path alias

`@/*` maps to `./src/*` (configured in tsconfig.json).

### ESLint

`@typescript-eslint/no-explicit-any` and `@typescript-eslint/no-unused-vars` are disabled.
