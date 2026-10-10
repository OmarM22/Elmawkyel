# Elmawkyel (الوكيل) — Construction Workforce Management

Internal, login-only system (Arabic RTL) for construction workforce attendance,
daily wages (SAR), weekly settlements, project costs, and derived reports.

## Stack

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS v4 · Prisma 7 ·
PostgreSQL · next-auth v4 (Credentials + JWT) · TanStack Query/Table · Vitest

## Quick start

```bash
npm install
cp .env.example .env   # then fill DATABASE_URL, NEXTAUTH_SECRET, admin seed vars
npx prisma migrate deploy
npx prisma db seed     # creates the first ADMIN (env vars only, never hardcoded)
npm run dev            # http://localhost:3000
```

| Command        | Purpose                                    |
| -------------- | ------------------------------------------ |
| `npm run dev`  | Dev server                                 |
| `npm run build`| Production build (also typechecks)        |
| `npm test`     | Unit + component tests (Vitest)            |
| `npm run lint` | ESLint                                     |

## Data modes

- `USE_DEMO_DATA=true` (default): in-memory store, no database needed.
- `USE_DEMO_DATA=false` + real `DATABASE_URL`: production PostgreSQL.

## Key conventions

- Money is integer halalas (`src/lib/money.ts`) — never float arithmetic.
- Daily attendance is the single source of truth; all totals derive from it.
- Attendance snapshots the daily rate at record time (history never rewrites).
- Login-only: no public registration; a single `ADMIN` role, enforced server-side.
- See `AGENTS.md` for the full contributor guide.
