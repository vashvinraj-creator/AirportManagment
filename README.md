# Simport Ops — Airport Operations Simulator

A live airport operations simulator: gates, runways, ground crews, and a flight
board, with a scheduling engine that detects conflicts and cascades delays the
way a real ops team experiences them.

## Stack

- **Frontend:** React 18 + Vite + Tailwind (green/black theme)
- **Backend:** Supabase (Postgres + Auth + Realtime), project `Airport Managment` (`wvvzgmtoqdggcyoplxyg`)
- **Auth:** Email/password, 3 roles — `admin`, `ground_staff`, `viewer` — enforced by Postgres Row Level Security, not just the UI
- **Realtime:** Every table (flights, gates, runways, crews, simulation clock) is live — change it in one tab, see it update in another

## Core features

- **Gate timeline (Gantt board):** horizontal timeline per gate, flights as blocks, drag-free click-to-assign
- **Scheduling engine** (`src/lib/scheduler.js`): pure functions that detect gate/runway conflicts and compute delay cascades — no UI dependency, easy to unit test
- **Auto-delay simulation:** a sim clock (admin/staff controlled, 1x–60x speed) that randomly injects operational events (fog, mechanical checks, ATC holds) and propagates delays to downstream flights sharing the same gate or runway slot
- **"Why was this flight delayed?" trace:** every delay is logged as an event with a cause and (if cascaded) which flight caused it
- **Role-based access:** viewers see everything read-only; ground staff can run operations; only admins manage team roles and delete records

## Local development

1. Install dependencies:
   ```
   npm install
   ```
2. Copy `.env.example` to `.env` (already done for you) — it points at the
   `Airport Managment` Supabase project.
3. Run the dev server:
   ```
   npm run dev
   ```
4. Sign up for an account in the app. **New accounts start as Viewer.** To get
   admin access, run this once in the Supabase SQL Editor (replace the email):
   ```sql
   update public.profiles set role = 'admin'
   where id = (select id from auth.users where email = 'you@example.com');
   ```
   After that, you can promote other users from the in-app **Team** tab.

## Deploying to Vercel

1. Push this project to a GitHub repo.
2. In Vercel: **New Project** → import the repo → framework preset **Vite**.
3. Add environment variables (Project Settings → Environment Variables):
   - `VITE_SUPABASE_URL` = `https://wvvzgmtoqdggcyoplxyg.supabase.co`
   - `VITE_SUPABASE_ANON_KEY` = the publishable key in `.env.example`
4. Deploy. Build command `npm run build`, output dir `dist` (Vercel's Vite
   preset sets these automatically).

The anon/publishable key is safe to expose client-side — it only grants what
the Postgres RLS policies allow (see `supabase` migrations applied to the
project; every table requires `authenticated`, and most writes require
`ground_staff` or `admin`).

## Database schema (already applied to the Supabase project)

- `profiles` — one row per user, holds `role`
- `airports`, `runways`, `gates`, `crews` — static resources
- `flights` — the schedule; `scheduled_*` vs `estimated_*` vs `actual_*` timestamps
- `crew_assignments` — turnaround tasks per flight
- `delay_events` — the audit trail behind the Delay Trace page
- `simulation_state` — singleton row driving the sim clock

All tables have RLS enabled. Read access requires any authenticated role;
write access requires `ground_staff` or `admin` depending on the table;
deletes are `admin`-only.

## Known follow-ups (non-blocking)

Supabase's advisor flagged a few **performance-only** lints (not security or
correctness issues) that didn't apply through this session — if you want to
squeeze more performance at scale, run this in the SQL Editor:

```sql
create index if not exists crew_assignments_crew_id_idx on public.crew_assignments(crew_id);
create index if not exists crews_airport_id_idx on public.crews(airport_id);
create index if not exists delay_events_caused_by_idx on public.delay_events(caused_by_flight_id);
create index if not exists flights_arrival_runway_idx on public.flights(arrival_runway_id);
create index if not exists flights_departure_runway_idx on public.flights(departure_runway_id);
create index if not exists flights_gate_idx on public.flights(gate_id);
create index if not exists flights_created_by_idx on public.flights(created_by);
create index if not exists gates_airport_id_idx on public.gates(airport_id);
create index if not exists runways_airport_id_idx on public.runways(airport_id);
```
