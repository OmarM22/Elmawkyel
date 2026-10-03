# Agents - Construction Workforce Management System (الوكيل)

High-signal context for AI agents. Every line answers: "Would an agent likely miss this without help?"

---

## Commands

| Action | Command |
|--------|---------|
| Dev server | `npm run dev` |
| Production build | `npx next build` (invoked as `node ./node_modules/next/dist/bin/next build` if npx misbehaves) |
| Typecheck | `npx tsc --noEmit` (build already typechecks) |
| Unit tests | `npm test` (= `node ./node_modules/vitest/vitest.mjs run`) |
| Prisma generate | `<pwd>/node_modules/.bin/prisma.cmd generate` ( Prisma 7.10.0, pinned `--save-exact`) |
| Migrate (needs real DB) | `prisma migrate dev --name <name>` (local) / `prisma migrate deploy` (server) |
| Seed first admin (needs real DB) | `INITIAL_ADMIN_EMAIL=x INITIAL_ADMIN_PASSWORD=y npx prisma db seed` (runs `tsx prisma/seed.ts` via devDependency) |

Package scripts are `dev/build/start/lint/test` (no other helpers).

---

## Architecture

- **Framework**: Next.js 16 App Router, React 19, TypeScript strict, Tailwind CSS **v4** (`@import "tailwindcss"` + `@theme inline` tokens in `globals.css`)
- **Database**: PostgreSQL via Prisma ORM 7, client generated into `src/generated/prisma/` (import `@/generated/prisma/client`). Prisma 7 **requires** an adapter: `new PrismaClient({ adapter: new PrismaPg({ connectionString }) })` from `@prisma/adapter-pg` + `pg`. Zero-arg construction is a type error.
- **Auth**: next-auth **v4** (`next-auth@4.24.x`, NOT v5 API) — Credentials provider, JWT sessions, scrypt password hashing via `node:crypto` (`src/lib/password.ts`, no bcrypt dep)
- **Request gate**: `src/proxy.ts` (Next 16 renamed middleware→proxy; a `middleware.ts` file must NOT exist or the build fails). Only `/login` + `/api/auth/*` are public; everything else 307-redirects to `/login` (pages) or 401s (APIs).
- **Data mode**: `USE_DEMO_DATA=true` = in-memory store in `src/server/demo.ts`. All API routes + login import from the dispatcher `src/server/store.ts`, which resolves the backend per call (demo vs `src/server/dbstore.ts`, the Prisma implementation with identical shapes). Demo mode never loads the pg driver (lazy `import()`). `USE_DEMO_DATA=false` + real `DATABASE_URL` = production.
- **Prisma store notes**: `dbstore.ts` converts Decimal→number and @db.Date→"YYYY-MM-DD" at the boundary; `recordAttendanceBatch` auto-provisions `ProjectAssignment` (covering-date lookup, else create at current rate) and deterministic `Week` rows (`weekNumber = floor(daysSinceProjectStart/7)+1`, find-or-create by `@@unique(projectId, weekNumber)`). Duplicate users surface as P2002 → Arabic "مسجل بالفعل" errors.
- **UI**: Arabic RTL-first (`<html lang="ar" dir="rtl">`), Cairo font stack, brand name **الوكيل**, shadcn-style primitives in `src/components/ui/`, `cn()` lives in `src/lib/utils.ts` (clsx + tailwind-merge). Never import `cn`/`ClassValue` from `class-variance-authority` (it only exports `cva`/`cx`).
- **Client/server split**: every interactive page is `"use client"` + TanStack Query inside `<AppShell>` (sidebar/header). `SessionProvider` + `QueryClientProvider` come from `src/app/providers.tsx` (root layout stays a Server Component so `metadata` export is legal).
- **Financial (Saudi)**: integer halalas via `src/lib/money.ts` (`toHalalas`, `mulRateDays`, `formatSAR` → `"1,200.00 ر.س"`) — never float arithmetic. Currency is SAR (Saudi Riyal).

---

## Auth & Roles (CRITICAL)

- Login-only internal system. No `/signup`, `/register`, no registration UI/API. `src/app/login/page.tsx` only (RHF + Zod, `signIn("credentials")`, `useSearchParams` requires `<Suspense>`).
- `/` redirects server-side: session → `/dashboard`, else `/login`.
- Roles `ADMIN | MANAGER | VIEWER` (Prisma `Role` enum + `User` model). JWT carries `id/username/role` (see `src/types/next-auth.d.ts`).
- **Enforce server-side**: proxy gates routes; API routes check `getServerSession(authOptions)` and return 401/403 (`/api/users/*` and attendance POST require ADMIN; VIEWER is read-only).
- Users table (demo) seeds the admin **only** from `INITIAL_ADMIN_EMAIL`/`INITIAL_ADMIN_PASSWORD`. Never commit real credentials. Demo store upgrades the env password to scrypt on first login.
- `NEXTAUTH_SECRET` must be a strong random value in production.

---

## Financial Safety (CRITICAL)

- Money stored as `Decimal(10,2)`; runtime math in integer halalas (`src/lib/money.ts`).
- Daily attendance is the **single source of truth** — dashboard, weekly, reports all derive from `DailyAttendance` rows (demo: `listAttendance`).
- **One project per person per day** (v1): unique `(personId, projectId, date)` enforced in `recordAttendanceBatch` (409/duplicate → upsert) and by DB `@@unique` in production.
- **Rate snapshots**: attendance stores `dailyRate` at record time; changing `Person.currentDailyRate` never rewrites history.
- **Recording scope**: the attendance UI only offers `ACTIVE` projects (history for other statuses via weekly/reports/person pages); the API itself accepts any valid projectId — enforce status server-side if that ever matters.
- Tests (`src/tests/unit/`): `money.test.ts` (helpers) + `calculation.test.ts` (scenarios: 200×6=1200, 150×6=900, multi-project, rate change, edit, delete, new week, project/global recalculation) + `people-table.test.tsx` + `dashboard.test.tsx` (jsdom component tests with mocked fetch/session). Vitest uses `environment: "node"` (jsdom only via per-file `// @vitest-environment jsdom`) with `@` aliased to `./src`.
- **Week-window convention**: dashboard KPIs use rolling last-7-days, explicitly labelled "آخر ٧ أيام"; `/weekly` uses a user-picked 7-day window; DB `Week` rows are deterministic project-week scaffolding (`floor(daysSinceProjectStart/7)+1`) reserved for future settlement. These are intentionally different — never compare totals across them without stating the window.
- **Tables**: TanStack Table v9 installed, but the v8-style skill API is used via `@tanstack/react-table/legacy` (`useLegacyTable`, `legacyCreateColumnHelper`, `get*RowModel`, `LegacyColumnDef` — root `ColumnDef` is the incompatible new type). Reusable shell: `src/components/ui/data-table.tsx` (sort/filter/paginate, RTL Arabic).

---

## Prisma 7 Gotchas (verified by build errors)

- Generator must be `provider = "prisma-client"` with explicit `output` (`../src/generated/prisma`); datasource block has **no** `url` (lives in root `prisma.config.ts`).
- `prisma` CLI is pinned to 7.10.0 to match `@prisma/client`. Never let it float to 8.x RC.
- `prisma/seed.ts` runs via `tsx` (devDependency) — plain `node` cannot resolve Prisma 7's extensionless `.ts` client imports.
- Next 16 route handlers: `params` is a `Promise` — `await params`.
- `useParams` comes from `next/navigation`, never from `@tanstack/react-query`.
- Pages using `useState`/`useEffect`/`useRouter`/`useSession`/`useQuery` must start with `"use client"`.
- `Button` supports `asChild` via `cloneElement` (no radix slot dep).

---

## What to Avoid

- Do NOT add Clerk back (removed; was the source of `failed_to_load_clerk_js`).
- Do NOT create `middleware.ts` (deprecated; build errors). Auth gate lives in `src/proxy.ts`.
- Do NOT implement signup/register anywhere.
- Do NOT store money as `Number`/float; do NOT bypass rate snapshots.
- Do NOT rely on frontend-only auth checks.
- Do NOT use Tailwind v3 directives (`@tailwind base;`) — v4 only.
- Do NOT run bulk regex replaces via shell scripts — PowerShell `@(@(...))` unwraps single-pair arrays (verified incident: char-level file corruption). Use the Edit tool for renames.
- Orphaned-but-compiling files (kept intentionally, do not rewire): `src/components/layout/theme-provider.tsx` (stub), `src/lib/prisma.ts` (real-DB only, unused in demo mode).

---

## Missing / To Do

- **Production cutover DONE (2026-10-03)**: local PG18 `construction` DB + least-privilege `construction_app` role (CREATEDB for shadow DB), `prisma/migrations/20261003144156_init/` applied, admin + 4 people + 3 projects seeded, `USE_DEMO_DATA=false`, production smoke test green (login, record, upsert, derived totals, person detail — all against real PG). DB password lives in `.env` `DATABASE_URL` only.
- Next features: user management DONE (see below); weekly settlement workflow DONE (see below); export/print DONE (see below); strong `NEXTAUTH_SECRET`; backup strategy for PG.
- **Export/print**: reports page has «تصدير CSV» (matrix + totals, BOM-prefixed for Excel Arabic, plain computable numbers, RFC-quoted cells via `src/lib/csv.ts`) and «طباعة» (`window.print` + print-only header; app chrome hidden via `print:hidden` in `AppShell`).
- **User management**: `PATCH /api/users/[id]` (ADMIN only; name/role/active/password-reset with server-side scrypt hash, self-demote/deactivate blocked 403). Edit form on `/users` page with «حسابك» badge on own row.
- **Settlement**: `/settlements` page (project → weeks table → per-person payment form). `GET /api/weeks?projectId=` lists deterministic weeks with dues/paid/status; `POST /api/weeks/[id]/payments` records payments (partial allowed, overpayment rejected 400, full payment → `SETTLED`), writes `Payment` + `AuditLog` rows (atomic `$transaction` in dbstore). Attendance recording/upsert is **blocked** on `SETTLED` weeks in both stores (400). Week math lives in `src/server/weekcalc.ts` and must stay identical across backends.
- **Settlement detail + void**: selecting a week shows dues, payment ledger, and (if open) the settle form. `DELETE /api/weeks/[weekId]/payments/[paymentId]` is ADMIN-only, reopens the week when a balance reappears, and writes a `VOID` audit entry. `dbstore.listWeeks` omits weeks with zero present rows to match demo derivation. The detail panel has a print-only settlement slip (dues, payments, signatures).
- **Workforce selection**: project form has active-people checkboxes synced via `POST`/`DELETE /api/projects/[id]/assignments` (ADMIN/MANAGER; idempotent assign, end-dated unassign preserving history, same-day clash reopens). Assignment snapshots `dailyRate` like attendance. Team shown on project detail page (`GET /api/projects/[id]` returns `{project, team}`).
- **Delete people**: `DELETE /api/people/[id]` (ADMIN/MANAGER; VIEWER → 403) with `ConfirmDialog` UI. Restrict rule: blocked 409 by attendance, payments, or open assignments (deactivate instead); ended-only assignment rows are cascade-removed with a history-free person.
- No hard-deletes for people/projects by design (attendance history has FKs) — deactivate via `active`/`status` instead. Shared Zod schemas in `src/lib/validation.ts` (used by routes and forms).
- Playwright E2E (not installed); CI workflow; pre-commit hooks
