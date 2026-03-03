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
- **`src/app/layout.tsx`** — Root layout with `next-themes` ThemeProvider (light/dark/system), Geist font family, PWA metadata.
- **`src/app/api/`** — RESTful API routes (see API section below).
- **`src/lib/auth.ts`** — Custom JWT auth using `jose`. Tokens stored in HTTP-only cookies (`workout-ai-session`). Sessions expire after 7 days.
- **`src/lib/db.ts`** — Direct SQL queries via `@vercel/postgres` (no ORM). Contains all database operations and table initialization (`initDatabase()`).
- **`src/lib/agents/`** — LangGraph-based AI agents (see AI agents section below).
- **`src/middleware.ts`** — Protects routes by validating JWT. Auth API routes and static files are excluded.
- **`src/types/`** — Shared TypeScript types: `workout.ts` (Exercise, Workout, WorkoutPreset, SplitReminder), `meal.ts` (Meal, Macros, MacroGoal, ChatMessage), `user.ts` (User, UserFact, AiSoul, SoulPresetId, FactCategory).

### API routes

All protected routes follow: `getSessionFromCookie()` → `initDatabase()` → db function → `NextResponse.json()`.

- **Auth:** `auth/login`, `auth/register`, `auth/logout`, `auth/me`
- **Workouts:** `workouts/` (GET, POST), `workouts/[id]/` (PUT, DELETE), `workouts/export` (GET — CSV export)
- **Exercises:** `exercises/all`, `exercises/track`, `exercises/seed`
- **Presets:** `presets/` (GET, POST), `presets/[id]/` (PUT, DELETE), `presets/reorder` (PUT)
- **Split:** `split/next` — returns next preset in rotation
- **Meals:** `meals/` (GET, POST), `meals/[id]/` (DELETE), `meals/reorder` (PUT), `meals/analyze` (POST — OpenAI vision), `meals/analyze/refine` (POST), `meals/saved/` (GET, POST — Food Bank), `meals/saved/[id]/` (DELETE), `meals/suggestions/` (GET), `meals/suggestions/[id]/accept` (POST), `meals/suggestions/[id]/dismiss` (POST)
- **Goals:** `goals/` (GET, PUT) — macro goals
- **Chat:** `chat/` (GET, POST streaming, DELETE), `chat/conversations/` (GET, POST), `chat/conversations/[id]/` (DELETE, PATCH)
- **Soul:** `soul/` (GET, POST, DELETE) — AI personality per user
- **Facts:** `facts/` (GET, POST), `facts/[id]/` (DELETE) — user facts extracted by AI or added manually

### Database

PostgreSQL (Vercel Postgres / Neon). Tables: `users`, `workouts`, `exercise_patterns`, `common_exercises`, `meals`, `macro_goals`, `workout_presets`, `chat_conversations`, `chat_messages`, `food_suggestions`, `ai_souls`, `user_facts`. Schema is auto-initialized in `initDatabase()` with `CREATE TABLE IF NOT EXISTS` and `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` for migrations.

**Important:** The `@vercel/postgres` `sql` template tag does not support passing arrays as parameters. Use SQL subqueries instead of `ANY($array)` syntax.

Exercises are stored as JSONB in both `workouts` and `workout_presets` tables. Exercise objects include per-set weight/reps arrays (`weightsPerSet`, `repsPerSet`) and effective reps fields.

### AI integration

Two packages are used for AI features:
- **`openai`** — Direct SDK usage for chat streaming and meal image analysis.
- **`@langchain/langgraph` + `@langchain/openai`** — LangGraph state machines for multi-step AI agents with Zod structured output.

Features:
- **Chat assistant** (`/api/chat`) — Streaming responses via OpenAI with user's workout history, today's meals, and macro goals as context. Multi-conversation support with auto-generated titles.
- **Meal analysis** (`/api/meals/analyze`) — Accepts text and/or image (base64) to estimate macros via OpenAI vision. Returns structured JSON with per-item breakdown.
- **Food suggestion agent** (`src/lib/agents/foodSuggestionAgent.ts`) — LangGraph StateGraph with 3 nodes (fetchData → analyze → save). Analyzes 3 weeks of meal history to suggest frequently logged meals for the Food Bank. Uses `ChatOpenAI.withStructuredOutput(zodSchema)` for typed responses. Compiled graph is cached as a singleton.
- **Soul builder agent** (`src/lib/agents/soulBuilderAgent.ts`) — LangGraph agent that generates AI personality ("soul") prompts from 5 presets (Drill Sergeant, Hype Coach, Wise Mentor, Friendly Trainer, Science Nerd) or custom user input. Soul is injected into chat system prompt.
- **Personality agent** (`src/lib/agents/personalityAgent.ts`) — LangGraph agent that extracts structured user facts (health, diet, goals, preferences, lifestyle, personality, training, adherence) from chat history and workout/meal data. Facts stored in `user_facts` table and fed into chat context.

### Component patterns

- **`WorkoutForm.tsx`** — Full-screen modal with @dnd-kit drag-and-drop, localStorage draft auto-save (keyed by `workout-ai-draft-{id}`), and unsaved changes detection.
- **`ExerciseRow.tsx`** — Per-exercise input with autocomplete, per-set weight/reps, and effective reps toggle.
- **`MealTracker.tsx`** — Daily meal logging with photo analysis, macro goal tracking, and category-based organization.
- **`ChatView.tsx`** — AI chat interface with multi-conversation support and streaming responses.
- **`PresetManager.tsx` / `PresetForm.tsx` / `PresetPicker.tsx`** — Workout preset CRUD with drag-to-reorder.
- **`SplitReminderBanner.tsx`** — Sequential split tracking via `getNextSplitPreset()` — matches last workout name to preset names, cycles through sort_order.
- **`CalendarView.tsx`** — Monthly calendar view of workouts with color-coded day cells. Composed of `CalendarGrid`, `CalendarDayCell`, `CalendarDayDetail`, and `CalendarLegend`.
- **`UserProfile.tsx`** — Profile settings, macro goal calculator, workout export, AI personality picker, and user facts management.
- **UI primitives** in `src/components/ui/` are shadcn/ui (New York style, configured in `components.json`).

### Hooks (`src/hooks/`)

- **`useExerciseCache.ts`** — 5-minute localStorage cache for exercise autocomplete. Falls back to stale cache on network failure. Methods: `searchExercises()`, `invalidateCache()`, `refreshCache()`.
- **`useScrollDirection.ts`** — Detects scroll direction (with configurable threshold) to hide/show bottom nav and header bars. Uses `requestAnimationFrame` for performance.
- **`useWorkoutColors.ts`** — Derives workout color categories from workouts + presets. Manages color overrides persisted in localStorage.

### Utility modules (`src/lib/`)

- **`dateGrouping.ts`** — Groups workouts by relative date (Today, Yesterday, This Week, Last Week, month sections).
- **`calendarColors.ts`** — 10-color palette with consistent hash-based assignment. Fuzzy matches workout names to preset names. Supports localStorage color overrides.
- **`mealUtils.ts`** — Auto-categorizes meals by time of day (breakfast < 12:30, lunch, snack, dinner). Time input conversion helpers.
- **`macroCalc.ts`** — Auto-calculates the 4th macro field when exactly 3 of 4 (calories, protein, carbs, fat) are provided.

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

### Tailwind CSS 4

Theme is defined via inline `@theme` in `src/app/globals.css` (no `tailwind.config.js`). Uses CSS variables for colors, radii, and spacing. Base color: slate.

### ESLint

ESLint 9 flat config (`eslint.config.mjs`). Disabled rules: `@typescript-eslint/no-explicit-any`, `@typescript-eslint/no-unused-vars`, `@typescript-eslint/no-empty-object-type`, `react/no-unescaped-entities`.

### Versioning

After completing a new feature or improvement, always increment the version displayed in `src/components/UserProfile.tsx`. Use `+0.0.1` for small changes and `+0.1.0` for larger features.

### Mobile companion app

A separate Expo (React Native) companion app exists at `../workout-ai-mobile/` (repo: `AryamanDubey28/workout-ai-mobile`). It shares the same backend API. When building new features in this PWA, append a row to `../workout-ai-mobile/BACKLOG.md` so the mobile agent can replicate the feature later.

### Testing

After completing a new feature, use the `mobile-ui-tester` agent to verify it works correctly on mobile (iPhone 14 Pro Max viewport). This catches layout issues, touch target problems, and functional bugs before merging.

### Merge workflow

When the user says "merge it in", "commit and merge", or equivalent — perform the full workflow: commit all changes, push the branch, create a PR, then merge the PR into main.
