# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- **Dev server:** `npm run dev` (uses Next.js with Turbopack)
- **Build:** `npm run build`
- **Lint:** `npm run lint`
- **Start production:** `npm run start`

No test framework is configured.

## Architecture

This is a **workout tracking & nutrition PWA** built with Next.js 15 (App Router), React 19, TypeScript, and Tailwind CSS 4.

### Key layers

- **`src/app/page.tsx`** — Single-page app. All top-level state lives here (user, workouts, UI flags, active tab) and is passed down as props. No external state management library; everything uses React hooks.
- **`src/app/api/`** — RESTful API routes (see API section below).
- **`src/lib/auth.ts`** — Custom JWT auth using `jose`. Tokens stored in HTTP-only cookies (`workout-ai-session`). Sessions expire after 7 days.
- **`src/lib/db.ts`** — Direct SQL queries via `@vercel/postgres` (no ORM). Contains all database operations and table initialization (`initDatabase()`).
- **`src/middleware.ts`** — Protects routes by validating JWT. Auth API routes and static files are excluded.
- **`src/types/`** — Shared TypeScript types: `workout.ts` (Exercise, Workout, WorkoutPreset, SplitReminder), `meal.ts` (Meal, Macros, MacroGoal, ChatMessage), `user.ts`.

### API routes

All protected routes follow: `getSessionFromCookie()` → `initDatabase()` → db function → `NextResponse.json()`.

- **Auth:** `auth/login`, `auth/register`, `auth/logout`, `auth/me`
- **Workouts:** `workouts/` (GET, POST), `workouts/[id]/` (PUT, DELETE)
- **Exercises:** `exercises/all`, `exercises/track`, `exercises/seed`
- **Presets:** `presets/` (GET, POST), `presets/[id]/` (PUT, DELETE), `presets/reorder` (PUT)
- **Split:** `split/next` — returns next preset in rotation
- **Meals:** `meals/` (GET, POST), `meals/[id]/` (DELETE), `meals/analyze` (POST — OpenAI vision), `meals/analyze/refine` (POST), `meals/saved/` (GET, POST — Food Bank), `meals/saved/[id]/` (DELETE)
- **Goals:** `goals/` (GET, PUT) — macro goals
- **Chat:** `chat/` (GET, POST streaming, DELETE), `chat/conversations/` (GET, POST), `chat/conversations/[id]/` (DELETE, PATCH)

### Database

PostgreSQL (Vercel Postgres / Neon). Tables: `users`, `workouts`, `exercise_patterns`, `common_exercises`, `meals`, `macro_goals`, `workout_presets`, `chat_conversations`, `chat_messages`. Schema is auto-initialized in `initDatabase()` with `CREATE TABLE IF NOT EXISTS` and `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` for migrations.

**Important:** The `@vercel/postgres` `sql` template tag does not support passing arrays as parameters. Use SQL subqueries instead of `ANY($array)` syntax.

Exercises are stored as JSONB in both `workouts` and `workout_presets` tables. Exercise objects include per-set weight/reps arrays (`weightsPerSet`, `repsPerSet`) and effective reps fields.

### OpenAI integration

Uses the `openai` npm package. Two AI features:
- **Chat assistant** (`/api/chat`) — Streaming responses via OpenAI with user's workout history, today's meals, and macro goals as context. Multi-conversation support with auto-generated titles.
- **Meal analysis** (`/api/meals/analyze`) — Accepts text and/or image (base64) to estimate macros via OpenAI vision. Returns structured JSON with per-item breakdown.

### Component patterns

- **`WorkoutForm.tsx`** — Full-screen modal with @dnd-kit drag-and-drop, localStorage draft auto-save (keyed by `workout-ai-draft-{id}`), and unsaved changes detection.
- **`ExerciseRow.tsx`** — Per-exercise input with autocomplete, per-set weight/reps, and effective reps toggle.
- **`MealTracker.tsx`** — Daily meal logging with photo analysis, macro goal tracking, and category-based organization.
- **`ChatView.tsx`** — AI chat interface with multi-conversation support and streaming responses.
- **`PresetManager.tsx` / `PresetForm.tsx` / `PresetPicker.tsx`** — Workout preset CRUD with drag-to-reorder.
- **`SplitReminderBanner.tsx`** — Sequential split tracking via `getNextSplitPreset()` — matches last workout name to preset names, cycles through sort_order.
- **`useExerciseCache.ts`** — Hook that caches exercise autocomplete data in localStorage for 5 minutes.
- **UI primitives** in `src/components/ui/` are shadcn/ui (New York style, configured in `components.json`).

### Tabs / Navigation

Bottom navigation (`BottomNav.tsx`) switches between tabs: `workouts`, `meals`, `chat`. Profile is accessed via a header button, not a tab. The active tab state lives in `page.tsx`.

### Auth

Registration requires a `REGISTRATION_SECRET` env var (prevents open signup). JWT secret is in `JWT_SECRET`.

### Environment variables

- `POSTGRES_URL` — Vercel Postgres connection string
- `JWT_SECRET` — Secret for signing JWTs
- `REGISTRATION_SECRET` — Required secret for new user registration
- `OPENAI_API_KEY` — OpenAI API key for chat and meal analysis features

### PWA

Configured via `@ducanh2912/next-pwa` in `next.config.js`. Auth routes are excluded from service worker caching. Disabled in development.

### Path alias

`@/*` maps to `./src/*` (configured in tsconfig.json).

### ESLint

`@typescript-eslint/no-explicit-any` and `@typescript-eslint/no-unused-vars` are disabled.
