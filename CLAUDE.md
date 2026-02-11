# CLAUDE.md — everybody.bike

## Project Overview

**everybody.bike** is a full-stack web application for a teaching mountain bike club. It serves as the scheduling and communications hub for club leaders, coaches ("Roll Models"), and parents of riders. The app is built as a Progressive Web App (PWA) with push notification support, backed by Supabase, and deployed via Docker Compose.

---

## Identity Model & Roles

The system distinguishes between two identity types:

### Adults (profiles — authenticated users)

Adults log in and interact with the app directly. Each adult can hold **any combination** of the following roles:

| Role | Description |
|------|-------------|
| **Super Admin** | Full system access: manage all users, roles, settings, and data. Can grant/revoke Admin. |
| **Admin** | Club leaders who manage events, groups, notifications, and invite new users |
| **Roll Model** | Volunteer coaches who RSVP to events and are assigned to rider groups |
| **Parent** | Parents of minor riders; RSVP their children and receive communications on their behalf |
| **Rider** | Adult participants in a rider group (coached just like kid riders) |

#### Role Hierarchy & Capabilities

| Capability | Super Admin | Admin | Roll Model | Parent | Rider |
|------------|:-----------:|:-----:|:----------:|:------:|:-----:|
| Manage users & assign roles | X | | | | |
| Promote/demote Admins | X | | | | |
| Invite new users via email | X | X | | | |
| CRUD events | X | X | | | |
| CRUD groups | X | X | | | |
| Schedule & send notifications | X | X | | | |
| View full event dashboard | X | X | X | | X |
| RSVP self to events | X | X | X | | X |
| RSVP minor riders to events | | | | X | |
| View simplified dashboard | | | | X | |
| Manage own profile & preferences | X | X | X | X | X |

- A single adult can be any combination: a Parent who is also a Roll Model, an Admin who is also a Rider, etc.
- Adults with the **Rider** role are assigned to a group and RSVP themselves to events (same mechanism as Roll Models).
- Adults with the **Parent** role RSVP on behalf of their minor children.
- An adult who is both a Parent and a Rider sees both their own RSVP controls and their children's.
- A user's effective permissions are the **union** of all their roles.

### Minors (riders — managed dependents, not direct users)

| Identity | Description |
|----------|-------------|
| **Minor Rider** | Youth participants managed entirely by their parent's account; they do not log in |

- Minor riders are linked to one or more parents/guardians (many-to-many via `rider_parents`).
- A parent can have multiple minor riders; a minor can have multiple parents/guardians.
- Minor riders can only be riders — they hold no other roles.
- Minor riders are assigned to exactly one group.

---

## Core Features

### 1. Authentication, Invites & Session Management

- **Magic link** login (passwordless email link via Supabase Auth).
- **Passkey** (WebAuthn/FIDO2) login as an alternative credential.
- No traditional username/password flow.
- Sessions must persist for **at least 3 months** (one season) on the PWA once signed in.
  - Use long-lived Supabase refresh tokens with a custom expiry of 90+ days.
  - The PWA should silently refresh the access token in the background.

#### Email Invites

- Admins onboard new users by entering their name, email, and initial role(s).
- The system creates a profile record and sends an **email invite** (magic link) to the new user.
- The invite email should be branded and explain what the club is and how to get started.
- On first login via the invite link, the user is prompted to:
  - Confirm their name.
  - Optionally register a **passkey** for faster future logins.
  - If they are a Parent: add their minor rider(s) (name, date of birth).
- Admins can **resend** invites to users who haven't yet signed in.
- Admins can view invite status (pending, accepted) in the user management area.

### 2. Events

- **Event types**: Rides, clinics, social events, meetings, other.
- Each event has: title, type, date/time, location (text + optional map link), description, assigned groups, capacity (optional), and weather notes.
- Events can be **recurring** (e.g., weekly rides) with the ability to edit a single occurrence or the series.
- Events are scoped to one or more **groups** (see below).

### 3. RSVP System

- **Roll Models** RSVP themselves to events: Yes / No / Maybe.
- **Adult Riders** RSVP themselves to events: Yes / No / Maybe (same mechanism as Roll Models).
- **Parents** RSVP each of their minor riders individually: Yes / No / Maybe.
- An adult who is both a Parent and a Rider (or Roll Model) sees RSVP controls for themselves **and** for each of their children on the same event page.
- RSVP deadlines can be set per event.
- RSVP changes are allowed up to the deadline (or event start if no deadline set).

### 4. Event Dashboard

- Each event has a dashboard view showing:
  - List of confirmed **Roll Models** with count.
  - List of confirmed **Riders** (both adult and minor), grouped by rider group, with count.
  - List of "Maybe" responses.
  - List of those who have not yet responded.
  - Roll Model-to-Rider ratio indicator.
- Adult riders and minor riders appear together within their group — the dashboard does not need to visually distinguish them (they're all riders in the group).
- Accessible to Admins, Roll Models, and Adult Riders. Parents see a simplified version (their own children's status plus aggregate counts).

### 5. Groups

- Named groups of riders (e.g., "Shredders", "Trail Blazers", skill/age-based groupings).
- Groups can contain both **minor riders** and **adult riders** — e.g., an adult riding group coached by Roll Models.
- Minor riders are assigned to exactly one group.
- Adult riders (profiles with the `rider` role) are assigned to exactly one group.
- Roll Models can be assigned to one or more groups (for coaching, not riding).
- Events can target specific groups or all groups.
- Groups have a display color for visual identification.

### 6. Push Notifications (PWA)

- Delivered via the **Web Push API** (VAPID protocol) — no native app required.
- Notification types:
  - New event published.
  - RSVP reminder (approaching deadline or event).
  - Event update or cancellation.
  - Custom admin message.
- **Scheduling**: Notifications can be scheduled for future delivery (stored in DB, dispatched by a background worker/cron).
- **Targeting**:
  - All users.
  - Specific groups.
  - Only those who **have** RSVP'd to a specific event.
  - Only those who **have not** RSVP'd to a specific event.
- Users manage their own notification preferences (opt-in/out by category).

### 7. CSV Import

- Admins can bulk-import users and riders via CSV upload.
- Supported CSV formats:
  - **Riders**: first name, last name, date of birth, group name, parent email(s).
  - **Adults** (Roll Models, Parents): full name, email, role(s).
- **Deduplication logic**:
  - Adults are matched by **email address** (case-insensitive). If a matching profile exists, roles are merged (unioned) rather than creating a duplicate.
  - Minor riders are matched by **first name + last name + date of birth** within the same parent. If a match exists, the record is updated rather than duplicated.
  - Roll Models referenced in a rider CSV (by email) are linked to existing profiles if they already exist.
- Import provides a **preview step** showing what will be created, updated, or skipped, before committing changes.
- Import errors (invalid emails, missing required fields, unknown group names) are reported per-row with the option to fix and retry.
- New parents discovered during rider import are automatically invited via email.

### 8. PWA

- Installable on mobile (Android and iOS) via "Add to Home Screen."
- Offline-capable: service worker caches the app shell and recently viewed data.
- Manifest with appropriate icons, theme color, and display mode (`standalone`).
- App should feel native — full-screen, no browser chrome, smooth transitions.

---

## Tech Stack

### Frontend

| Layer | Choice | Rationale |
|-------|--------|-----------|
| Framework | **Next.js 16** (App Router) | SSR/SSG for performance, API routes for BFF, strong PWA ecosystem |
| Language | **TypeScript** (strict mode) | Type safety across the stack |
| Styling | **Tailwind CSS v4** | Utility-first; theme config in `globals.css` via `@theme inline {}` (no `tailwind.config.ts`) |
| Components | **shadcn/ui** | Accessible, composable primitives built on Radix UI |
| State | **React Query (TanStack Query)** | Server state caching, optimistic updates for RSVPs |
| Forms | **React Hook Form + Zod v4** | Validation with schema reuse between client and server |
| PWA | **Custom service worker** | Manual `sw.js` for push notifications; offline caching planned |
| Push Client | **Web Push API** | Browser-native push subscription management |

### Backend

| Layer | Choice | Rationale |
|-------|--------|-----------|
| Database | **Supabase (PostgreSQL)** | Managed Postgres with auth, realtime, storage, and RLS |
| Auth | **Supabase Auth** | Magic link + passkey support, JWT-based sessions |
| API | **Supabase client SDK + Next.js Route Handlers** | Direct DB access via RLS where possible; route handlers for complex logic |
| Push Server | **web-push** (Node.js library) | VAPID-based push message dispatch |
| Background Jobs | **API route + cron/webhook** | `/api/admin/notifications/dispatch` triggered by external cron (Bearer token auth) |
| Migrations | **Supabase CLI migrations** | Versioned, sequential SQL migration files managed by `supabase migration` |
| File Storage | **Supabase Storage** | Profile photos, event images if needed |

### Infrastructure

| Layer | Choice | Rationale |
|-------|--------|-----------|
| Containerization | **Docker + Docker Compose** | App container + Supabase stack in parallel |
| App Container | **Node.js 22 Alpine** | Runs Next.js in production mode (standalone output) |
| Supabase Self-Hosted | **supabase/docker** | Official self-hosted Supabase containers (Postgres, Auth, Realtime, REST, Storage, Kong, Analytics) |
| TLS / Proxy | **Cloudflare Tunnel** | HTTPS termination and routing (user-managed, added as Docker service) |

---

## Deployment Architecture

**Local dev**: Uses Supabase CLI (`supabase start`) for the database stack. Next.js runs via `npm run dev` outside Docker for hot reload.

**Production**: Docker Compose with self-hosted Supabase + Next.js app + cron service. All services on a shared Docker network. Cloudflare Tunnel handles HTTPS and public routing.

### Docker Compose Services

| Service | Container | Purpose |
|---------|-----------|---------|
| **app** | Next.js (built from `Dockerfile`) | The everybody.bike web app |
| **db** | supabase/postgres:15 | PostgreSQL database |
| **kong** | kong:2.8.1 | API gateway (routes to auth, rest, realtime, storage) |
| **auth** | supabase/gotrue | Magic link + passkey authentication |
| **rest** | postgrest/postgrest | REST API for Supabase client SDK |
| **realtime** | supabase/realtime | Realtime subscriptions (WebSocket) |
| **storage** | supabase/storage-api | File/object storage |
| **imgproxy** | darthsim/imgproxy | Image transformation |
| **studio** | supabase/studio | Database admin dashboard |
| **meta** | supabase/postgres-meta | DB metadata API (for Studio) |
| **analytics** | supabase/logflare | Log analytics |
| **vector** | timberio/vector | Log collection/forwarding |
| **supavisor** | supabase/supavisor | Connection pooler |
| **cron** | alpine + crond | Notification dispatch (every 2 min) |
| **migrate** | postgres (profile) | On-demand app migration runner |

### Internal Routing

- Server-side Supabase clients (`server.ts`, `admin.ts`) prefer `SUPABASE_URL` env var (`http://kong:8000`) for internal Docker networking, falling back to `NEXT_PUBLIC_SUPABASE_URL` (the public URL).
- Browser-side uses `NEXT_PUBLIC_SUPABASE_URL` (public URL, baked at build time).
- Kong routes: `/auth/v1/*` → auth, `/rest/v1/*` → rest, `/realtime/v1/*` → realtime, `/storage/v1/*` → storage.

### Exposed Ports (for Cloudflare Tunnel)

- `app:3000` — The web app (map to `everybody.bike`)
- `kong:8000` — Supabase API gateway (map to `api.everybody.bike`)
- Studio accessible via Kong's dashboard route (basic auth protected)

Environment variables are managed via `.env` files (not committed; `.env.production.example` provided).

---

## Recent Updates (2026-02-10)

- **Docker Compose production deployment**: Full self-hosted Supabase stack (14 services) + Next.js app + cron for notifications.
- Added `SUPABASE_URL` server-only env var for internal Docker routing (`server.ts`, `admin.ts` prefer it over `NEXT_PUBLIC_SUPABASE_URL`).
- `scripts/generate-keys.sh` generates all Supabase infrastructure secrets.
- `scripts/crontab` dispatches notifications every 2 min via `wget`.
- `volumes/` directory contains all Supabase Docker init scripts (from official repo).
- App migrations auto-mount into DB container's init directory on first start.
- On-demand migration runner: `docker compose run --rm migrate`.
- GoTrue configured with 90-day sessions, 12-hour OTP expiry, refresh token rotation, custom email templates.
- `.env.production.example` documents every required secret with generation instructions.

### Previous (2026-02-09)

- Added configurable base URL helper (`src/lib/url.ts`) and wired invite/resend redirect generation to prefer env + forwarded headers.
- Added OTP code entry on login for email OTP verification.
- Local Supabase Auth email links now use custom templates so links point to `{{ .SiteURL }}` (supports Cloudflare tunnel domain).
- Magic link + invite email templates include explicit expiry duration + timestamp metadata.
- `otp_expiry` set to 12 hours in local `supabase/config.toml`.
- Auth email sender set to `Everybody.Bike <admin@everybody.bike>` in `supabase/config.toml` (SMTP block present; enable as needed).

---

## Database Schema (Baseline)

### Tables

#### Adults (authenticated users)

```
profiles
  id              UUID PK (references auth.users)
  full_name       TEXT NOT NULL
  email           TEXT NOT NULL
  roles           TEXT[] NOT NULL  -- any combo of: 'super_admin', 'admin', 'roll_model', 'parent', 'rider'
  rider_group_id  UUID FK -> groups(id)   -- set when 'rider' is in roles; the group this adult rides in
  avatar_url      TEXT
  invite_status   TEXT NOT NULL DEFAULT 'pending' CHECK (invite_status IN ('pending','accepted'))
  invited_at      TIMESTAMPTZ             -- when the invite email was sent
  invited_by      UUID FK -> profiles(id) -- admin who sent the invite
  created_at      TIMESTAMPTZ
  updated_at      TIMESTAMPTZ
```

- `roles` is an array — an adult can be `['parent', 'roll_model']`, `['admin', 'rider']`, etc.
- `rider_group_id` is only meaningful when `'rider'` is in `roles`. A CHECK constraint or app-level validation should enforce this.
- `invite_status` tracks whether the user has completed their first login via the invite magic link.

#### Minor Riders (dependents, not authenticated)

```
riders
  id              UUID PK DEFAULT gen_random_uuid()
  first_name      TEXT NOT NULL
  last_name       TEXT NOT NULL
  group_id        UUID FK -> groups(id)
  date_of_birth   DATE
  emergency_contact TEXT
  medical_notes   TEXT
  created_at      TIMESTAMPTZ
  updated_at      TIMESTAMPTZ

rider_parents (join table — many-to-many between riders and parent profiles)
  rider_id        UUID FK -> riders(id) ON DELETE CASCADE
  parent_id       UUID FK -> profiles(id) ON DELETE CASCADE
  relationship    TEXT NOT NULL DEFAULT 'parent'  -- 'parent', 'guardian', 'emergency_contact'
  is_primary      BOOLEAN NOT NULL DEFAULT false  -- primary contact for this rider
  PRIMARY KEY (rider_id, parent_id)
```

- The `riders` table is exclusively for **minors**. Adult riders are represented in `profiles` with `'rider'` in their `roles` array.
- **Riders and parents are many-to-many**: a minor can have multiple parents/guardians (e.g., both parents have accounts), and a parent can have multiple minor riders.
- `is_primary` indicates the main contact parent for notifications and communications.
- Any parent linked to a rider can RSVP that rider to events.

#### Groups, Events & RSVPs

```
groups
  id              UUID PK DEFAULT gen_random_uuid()
  name            TEXT NOT NULL UNIQUE
  color           TEXT NOT NULL DEFAULT '#6B7280'
  description     TEXT
  sort_order      INT DEFAULT 0
  created_at      TIMESTAMPTZ

roll_model_groups (join table — which groups a Roll Model coaches)
  roll_model_id   UUID FK -> profiles(id)
  group_id        UUID FK -> groups(id)
  PRIMARY KEY (roll_model_id, group_id)

events
  id              UUID PK DEFAULT gen_random_uuid()
  title           TEXT NOT NULL
  type            TEXT NOT NULL CHECK (type IN ('ride','clinic','social','meeting','other'))
  description     TEXT
  location        TEXT
  map_url         TEXT
  starts_at       TIMESTAMPTZ NOT NULL
  ends_at         TIMESTAMPTZ
  rsvp_deadline   TIMESTAMPTZ
  capacity        INT
  weather_notes   TEXT
  recurrence_rule TEXT           -- iCal RRULE string, NULL if one-off
  series_id       UUID           -- links occurrences in a recurring series
  created_by      UUID FK -> profiles(id)
  created_at      TIMESTAMPTZ
  updated_at      TIMESTAMPTZ

event_groups (join table)
  event_id        UUID FK -> events(id) ON DELETE CASCADE
  group_id        UUID FK -> groups(id) ON DELETE CASCADE
  PRIMARY KEY (event_id, group_id)

rsvps
  id              UUID PK DEFAULT gen_random_uuid()
  event_id        UUID FK -> events(id) ON DELETE CASCADE NOT NULL
  user_id         UUID FK -> profiles(id) NOT NULL       -- the adult performing the RSVP action
  rider_id        UUID FK -> riders(id)                   -- set when a Parent RSVPs a minor; NULL for self-RSVPs
  status          TEXT NOT NULL CHECK (status IN ('yes','no','maybe'))
  responded_at    TIMESTAMPTZ DEFAULT now()
  -- For self-RSVPs (rider_id IS NULL): UNIQUE (event_id, user_id) via partial unique index
  -- For minor RSVPs (rider_id IS NOT NULL): UNIQUE (event_id, rider_id) via partial unique index
  -- This allows either parent to update a minor's RSVP without creating duplicates
```

**RSVP semantics:**
- **Roll Model or Adult Rider RSVPing for themselves**: `user_id` = their profile ID, `rider_id` = NULL.
- **Parent RSVPing a minor**: `user_id` = parent's profile ID, `rider_id` = the minor's rider ID. Any parent linked to the rider via `rider_parents` can do this.
- **Adult who is both a Rider and a Parent**: creates separate RSVP rows — one for themselves (`rider_id` = NULL) and one per minor child (`rider_id` = child's ID).
- If two parents both RSVP the same minor to the same event, the later response wins (upsert on the unique constraint using `rider_id`, not `user_id`, for minor RSVPs).

#### Notifications & Push

```
push_subscriptions
  id              UUID PK DEFAULT gen_random_uuid()
  user_id         UUID FK -> profiles(id) ON DELETE CASCADE NOT NULL
  endpoint        TEXT NOT NULL UNIQUE
  keys_p256dh     TEXT NOT NULL
  keys_auth       TEXT NOT NULL
  user_agent      TEXT
  created_at      TIMESTAMPTZ

notification_preferences
  user_id         UUID FK -> profiles(id) ON DELETE CASCADE PK
  new_event       BOOLEAN DEFAULT true
  rsvp_reminder   BOOLEAN DEFAULT true
  event_update    BOOLEAN DEFAULT true
  custom_message  BOOLEAN DEFAULT true

scheduled_notifications
  id              UUID PK DEFAULT gen_random_uuid()
  title           TEXT NOT NULL
  body            TEXT NOT NULL
  url             TEXT                                    -- deep link into the app
  scheduled_for   TIMESTAMPTZ NOT NULL
  target_type     TEXT NOT NULL CHECK (target_type IN ('all','group','event_rsvpd','event_not_rsvpd'))
  target_id       UUID                                    -- group_id or event_id depending on target_type
  sent            BOOLEAN DEFAULT false
  created_by      UUID FK -> profiles(id)
  created_at      TIMESTAMPTZ
```

### Row Level Security (RLS) Policies

- **profiles**: All authenticated users can read. Users can update only their own profile (name, avatar). Only Super Admins and Admins can update roles or invite_status.
- **riders**: Parents can CRUD minor riders linked to them via `rider_parents`. Admins+ can CRUD all. Roll Models can read minor riders in their assigned groups.
- **rider_parents**: Parents can read/manage their own links. Admins+ can CRUD all.
- **groups**: All authenticated users can read. Admins+ can CRUD.
- **events**: All authenticated users can read events for groups they belong to (as rider, roll model, or parent of a rider in that group). Admins+ can CRUD.
- **rsvps**: Users can read RSVPs for events they can see. Users can insert/update their own RSVPs (self or their minor riders'). Admins+ can read all.
- **push_subscriptions**: Users can CRUD their own. No cross-user access.
- **scheduled_notifications**: Admins+ only.

### Database Migrations

All schema changes are managed via **Supabase CLI migrations** (`supabase migration`):

- Migrations live in `supabase/migrations/` as sequentially numbered SQL files (e.g., `20260208000000_initial_schema.sql`).
- Each migration is a pure SQL file — forward-only, no auto-generated down migrations (rollbacks are handled by writing a new corrective migration).
- Migrations run automatically on `supabase db reset` (dev) and are applied in production via `supabase db push`.
- **Workflow**:
  1. Create a new migration: `supabase migration new <description>` (generates a timestamped file).
  2. Write the SQL (DDL, RLS policies, indexes, seed data if needed).
  3. Apply locally: `supabase db reset` (resets and replays all migrations + seed).
  4. Test the migration against the local Supabase instance.
  5. Commit the migration file to version control.
  6. In CI/production: `supabase db push` applies pending migrations.
- RLS policies, functions, triggers, and indexes should all be defined in migrations — not applied manually.
- The initial migration (`00001_initial_schema.sql`) creates all baseline tables, indexes, RLS policies, and the `rider_parents` join table.
- Subsequent migrations handle schema evolution as features are added.

---

## Visual Design Direction

The UI should evoke the **rugged, adventurous spirit of mountain biking**:

- **Color palette**: Earthy tones — forest greens, trail browns, slate grays, with high-energy accent colors (orange or amber) for CTAs and alerts.
  - Primary: `#2D5016` (deep forest green)
  - Secondary: `#78716C` (warm stone gray)
  - Accent: `#EA580C` (burnt orange)
  - Background: `#FAFAF9` (warm white) / `#1C1917` (dark mode: dark earth)
  - Danger: `#DC2626`
  - Success: `#16A34A`
- **Typography**: Bold, slightly condensed sans-serif headings (e.g., Inter or Barlow). Clean body text.
- **Texture**: Subtle topographic map patterns or trail contour lines as background accents (CSS/SVG, not heavy images).
- **Iconography**: Outlined, sturdy icons. Bike/trail/nature motifs where appropriate.
- **Components**: Rounded but not bubbly — `rounded-lg` (8px). Visible borders, slight shadows. Cards with solid presence.
- **Mobile-first**: Thumb-friendly tap targets (min 44px). Bottom navigation bar in PWA mode.
- **Dark mode**: Supported, defaulting to system preference.

---

## Project Structure

```
everybody.bike/
├── CLAUDE.md                    # This file
├── README.md
├── docker-compose.yml           # Production: all services (Supabase + app + cron)
├── Dockerfile                   # Production multi-stage build (Next.js app)
├── .env.example                 # Local dev env template
├── .env.production.example      # Production env template (all secrets documented)
├── .gitignore
├── next.config.ts               # Next.js config (security headers, standalone output)
├── tsconfig.json
├── package.json
├── vitest.config.ts             # Test runner config
├── eslint.config.mjs
├── postcss.config.mjs
├── components.json              # shadcn/ui config
├── public/
│   ├── manifest.json            # PWA manifest (standalone, themed)
│   ├── sw.js                    # Service worker (push notifications)
│   └── icons/                   # PWA icons (192, 512, maskable)
├── src/
│   ├── proxy.ts                 # Next.js 16 proxy (replaces middleware.ts)
│   ├── app/                     # Next.js App Router
│   │   ├── layout.tsx           # Root layout (providers, theme, metadata)
│   │   ├── page.tsx             # Dashboard
│   │   ├── error.tsx            # Global error boundary
│   │   ├── login/page.tsx
│   │   ├── auth/callback/page.tsx
│   │   ├── onboarding/page.tsx
│   │   ├── profile/page.tsx
│   │   ├── notifications/page.tsx  # Notification preferences
│   │   ├── events/
│   │   │   ├── page.tsx            # Event list (upcoming + past)
│   │   │   ├── new/page.tsx
│   │   │   └── [id]/
│   │   │       ├── page.tsx        # Event detail + dashboard
│   │   │       ├── edit/page.tsx
│   │   │       └── report/page.tsx # Printable roster
│   │   ├── groups/
│   │   │   ├── page.tsx
│   │   │   └── [id]/page.tsx
│   │   ├── admin/
│   │   │   ├── page.tsx            # Admin dashboard
│   │   │   ├── users/page.tsx      # User management + invites
│   │   │   ├── import/page.tsx     # CSV import wizard
│   │   │   └── notifications/page.tsx
│   │   └── api/                    # ~40 API route handlers (BFF pattern)
│   │       ├── auth/               # me, sign-out, passkey/*
│   │       ├── events/             # CRUD + [id]/dashboard
│   │       ├── groups/             # CRUD + [id]/members
│   │       ├── rsvps/              # mine, create/update, delete
│   │       ├── riders/             # mine (parent's riders)
│   │       ├── profile/            # get/update own profile
│   │       ├── passkeys/           # list, delete
│   │       ├── roll-model-groups/  # mine
│   │       ├── notifications/      # subscribe, unsubscribe, vapid, preferences
│   │       └── admin/              # users, riders, invite, import, notifications, dispatch
│   ├── components/
│   │   ├── ui/                  # shadcn/ui primitives (~25 components)
│   │   ├── events/              # event-card, event-form, event-dashboard, event-report, etc.
│   │   ├── rsvp/                # rsvp-controls, rsvp-button-group
│   │   ├── groups/              # group-list, group-form, member-assignment-dialog
│   │   ├── admin/               # user-list, invite-form, csv-import, notification-scheduler
│   │   ├── notifications/       # notification-preferences
│   │   ├── safety/              # safety-indicators (medical alerts, media opt-out)
│   │   └── layout/              # app-shell, header, sidebar, bottom-nav, theme-provider
│   ├── lib/
│   │   ├── supabase/
│   │   │   ├── client.ts        # Browser client (signOut only — never for data fetching)
│   │   │   ├── server.ts        # Server client (cookie-based, used in all API routes)
│   │   │   ├── admin.ts         # Service-role client (bypasses RLS)
│   │   │   ├── middleware.ts    # Session refresh logic (called by proxy.ts)
│   │   │   └── types.ts         # Generated Supabase DB types
│   │   ├── validators.ts        # Zod v4 schemas (looseUuid for seed data compat)
│   │   ├── utils.ts             # cn(), formResolver() (Zod v4 compat shim)
│   │   ├── csv-parser.ts        # CSV import parsing
│   │   ├── recurrence.ts        # RRULE expansion/helpers
│   │   ├── passkey.ts           # WebAuthn RP ID/origin derivation
│   │   ├── push.ts              # Client-side push utilities
│   │   ├── push-server.ts       # Server-side VAPID/web-push wrapper
│   │   └── url.ts               # Base URL helper (env → headers → default)
│   ├── hooks/
│   │   ├── use-auth.ts          # Profile + session via /api/auth/me
│   │   ├── use-events.ts        # Events queries + mutations
│   │   ├── use-event-dashboard.ts
│   │   ├── use-groups.ts        # Groups queries + mutations
│   │   ├── use-rsvp.ts          # RSVP mutations
│   │   ├── use-my-riders.ts     # Parent's linked riders
│   │   ├── use-my-roll-model-groups.ts
│   │   ├── use-admin-riders.ts
│   │   ├── use-admin-user-riders.ts
│   │   ├── use-users.ts         # Admin user management
│   │   ├── use-push.ts          # Web Push subscription
│   │   └── use-notifications.ts # Notification preferences + scheduling
│   └── types/
│       └── index.ts             # All TS types, enums, enriched/joined types
├── supabase/
│   ├── config.toml              # Local dev config (auth, SMTP, rate limits)
│   ├── templates/               # Custom email templates (invite, magic_link)
│   ├── migrations/              # 7 migration files (initial + incremental)
│   └── seed.sql                 # Dev seed data
├── volumes/                     # Supabase Docker init scripts (from official repo)
│   ├── api/kong.yml             # Kong API gateway routing config
│   ├── db/                      # DB init: roles, jwt, realtime, webhooks, etc.
│   ├── logs/vector.yml          # Log collection pipeline config
│   ├── pooler/pooler.exs        # Connection pooler init
│   └── storage/                 # File storage data (gitignored)
├── scripts/
│   ├── generate-keys.sh         # Generate all Supabase infrastructure secrets
│   └── crontab                  # Cron schedule for notification dispatch
└── vitest.config.ts
```

---

## Testing Strategy

| Layer | Tool | Scope |
|-------|------|-------|
| Unit | **Vitest** | Utility functions, Zod schemas, hooks (with React Testing Library) |
| Component | **Vitest + React Testing Library** | UI components in isolation |
| Integration | **Vitest + MSW** | API route handlers, Supabase interactions (mocked) |
| E2E | **Playwright** | Critical user flows: login, RSVP, event creation, notification preferences |
| Database | **pgTAP** or migration tests | RLS policies, schema constraints |

### Coverage Targets

- **Unit + Component**: 80%+ line coverage.
- **E2E**: Cover every core user journey (login, create event, RSVP, view dashboard, manage notifications).
- CI runs all tests on every PR.

---

## Security Considerations

- **Authentication**: Magic link + passkey only. No passwords to leak.
- **Authorization**: Supabase RLS enforces row-level access. API route handlers double-check roles for mutations.
- **Input validation**: All user input validated with Zod on both client and server.
- **CSRF**: Handled by Supabase Auth (cookie-based with PKCE).
- **XSS**: React's default escaping + CSP headers.
- **Secrets management**: VAPID keys, Supabase service role key, and JWT secrets stored as environment variables, never committed.
  - In dev, the service role key can be read from `supabase status` (the CLI may label it as "Secret").
  - The bootstrap script falls back to `supabase status --output json` when `SERVICE_ROLE_KEY` is not set.
- **Rate limiting**: Applied to auth endpoints and push subscription creation.
- **Data privacy**: Minor rider data treated as sensitive. Minimal data collection. No analytics tracking of children. CSV uploads are processed server-side and not persisted after import.

---

## Development Workflow

```bash
# Start the full stack locally
docker compose up -d

# Run the app in dev mode (outside Docker for hot reload)
npm run dev

# Generate Supabase types after schema changes
npm run db:types

# Run tests
npm run test          # unit + integration
npm run test:e2e      # Playwright

# Apply a new migration
npm run db:migrate

# Lint and format
npm run lint
npm run format
```

---

## Non-Functional Requirements

- **Performance**: First Contentful Paint < 1.5s on 4G. Lighthouse PWA score > 90.
- **Accessibility**: WCAG 2.1 AA compliance. Keyboard navigable. Screen reader tested.
- **Browser support**: Latest 2 versions of Chrome, Safari, Firefox, Edge. iOS Safari 16+.
- **Offline**: App shell loads offline. Cached event data viewable. RSVPs queued and synced on reconnect.
- **Scalability**: Designed for a single club (tens of Roll Models, hundreds of riders). No multi-tenancy required at this stage.

---

## Implementation Phases

### Phase 1 — Foundation
- [x] Project scaffolding (Next.js 16, Tailwind v4, shadcn/ui, TypeScript).
- [x] Database schema and migrations (5 migration files).
- [x] Auth flow (magic link + passkey/WebAuthn).
- [x] Invite onboarding flow (confirm name, optional passkey, add minor riders).
- [x] Long-lived session configuration (90+ day refresh token).
- [x] Basic layout and navigation with rugged theme.
- [x] Production Dockerfile (multi-stage, Node 20 Alpine).

### Phase 2 — Core Features
- [x] Event CRUD (with recurring event support, series edit/delete).
- [x] RSVP system (self-RSVP for Roll Models and Adult Riders; parent-RSVP for minors).
- [x] Admin RSVP override + clear.
- [x] Roll Model per-event group assignment.
- [x] Event dashboard (role-aware views + ratio indicator).
- [x] Event report (printable roster + safety flags).
- [x] Group management and assignment (minor + adult riders, roll models).
- [x] CSV import with deduplication + preview + auto-invites.
- [x] User invite flow and management (roles, resend, status).
- [x] Profile management (name/email, linked riders, medical alerts, media opt-out).
- [x] Safety indicators (medical alerts + media opt-out badges).

### Phase 3 — Notifications & PWA
- [x] PWA manifest + icons + theme metadata.
- [x] Web Push subscription management.
- [x] Notification scheduling + targeting + dispatch (with preference filtering).
- [x] Notification preferences UI.
- [x] Admin notifications UI (schedule/send).
- [ ] Service worker offline cache (app shell + recent data).

### Phase 4 — Polish & Deployment
- [x] Dark mode.
- [x] Security headers (CSP, X-Frame-Options, etc.).
- [x] Error boundaries (root error.tsx).
- [x] Docker Compose with self-hosted Supabase containers.
- [x] Production `.env.production.example` with all secrets documented.
- [x] Secret generation script (`scripts/generate-keys.sh`).
- [x] Cron service for notification dispatch.
- [x] Internal Docker routing (`SUPABASE_URL` for server-side).
- [x] App migrations auto-applied on first DB init.
- [ ] Cloudflare Tunnel service added to Docker Compose.
- [ ] Comprehensive test suite (unit, integration, e2e).
- [ ] Offline support and sync (queued RSVPs).
- [ ] Performance optimization (Lighthouse audit).
- [ ] CI/CD pipeline.
- [ ] SMTP provider verified (Mailgun domain pending).

---

## Recent Updates (Feb 9, 2026)

- Codebase audit: updated CLAUDE.md to match actual tech stack (Next.js 16, Tailwind v4, Zod v4).
- Added production Dockerfile (multi-stage Node 20 Alpine build with standalone output).
- Added security headers (CSP, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy).
- Added root error boundary (`error.tsx`) for graceful error recovery.
- Configured long-lived Supabase sessions (90-day refresh token via `config.toml`).
- Events list now splits Upcoming vs Past, with past events visually muted.
- Admin RSVP overrides and clears are blocked for past events (UI + API guard).
- Event dashboard now shows RSVP lists for events without groups (no-group fallback).
- Passkey WebAuthn now derives RP ID/origin from request headers for tunnels; env can override.
- Added passkey management: name on registration, list/rename/remove in Profile, and API endpoints.
- Passkey credentials store bytea public keys correctly; login updates `last_used_at`.
- Added dev-only overwrite toggle for passkey registration (`NEXT_PUBLIC_WEBAUTHN_ALLOW_OVERWRITE_DEV`).
- Configured Supabase Auth SMTP for Mailgun; email sending still blocked pending Mailgun domain verification/allowed sender domain.
- Added per-user calendar feed (ICS) with RSVP status, secured by a rotatable token, plus Profile UI to copy/subscribe/rotate.

---

## Commands Reference

| Command | Purpose |
|---------|---------|
| `npm run dev` | Start Next.js dev server |
| `npm run build` | Production build |
| `npm run start` | Start production server |
| `npm run test` | Run Vitest (unit + integration) |
| `npm run test:e2e` | Run Playwright e2e tests |
| `npm run lint` | ESLint check |
| `npm run format` | Prettier format |
| `npm run db:types` | Regenerate Supabase TypeScript types |
| `npm run db:migrate` | Apply pending database migrations |
| `npm run db:reset` | Reset local database and re-seed |
| `docker compose up -d` | Start all containers |
| `docker compose down` | Stop all containers |
