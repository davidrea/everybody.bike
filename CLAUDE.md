# CLAUDE.md — everybody.bike

## Project Overview

**everybody.bike** is a full-stack web application for a teaching mountain bike club. It serves as the scheduling and communications hub for club leaders, coaches ("Roll Models"), and parents of riders. The app is built as a Progressive Web App (PWA) with push notification support, backed by Supabase, and deployed via Docker Compose.

---

## Personas & Roles

| Role | Description |
|------|-------------|
| **Admin** | Club leaders who manage events, groups, notifications, and user roles |
| **Roll Model** | Volunteer coaches who RSVP to events and are assigned to rider groups |
| **Parent** | Parents of riders who RSVP their children and receive communications |
| **Rider** | Youth participants; managed by their parent account (not direct users) |

- Admins have full CRUD access to all entities.
- Roll Models can view events, RSVP themselves, and view dashboards.
- Parents can view events, RSVP their riders, and view dashboards.
- A user may hold multiple roles (e.g., an Admin who is also a Roll Model).

---

## Core Features

### 1. Authentication & Session Management

- **Magic link** login (passwordless email link via Supabase Auth).
- **Passkey** (WebAuthn/FIDO2) login as an alternative credential.
- No traditional username/password flow.
- Sessions must persist for **at least 3 months** (one season) on the PWA once signed in.
  - Use long-lived Supabase refresh tokens with a custom expiry of 90+ days.
  - The PWA should silently refresh the access token in the background.
- First-time users are onboarded by an Admin who creates their account and triggers a magic link invite.

### 2. Events

- **Event types**: Rides, clinics, social events, meetings, other.
- Each event has: title, type, date/time, location (text + optional map link), description, assigned groups, capacity (optional), and weather notes.
- Events can be **recurring** (e.g., weekly rides) with the ability to edit a single occurrence or the series.
- Events are scoped to one or more **groups** (see below).

### 3. RSVP System

- Roll Models RSVP themselves to events: Yes / No / Maybe.
- Parents RSVP individual riders to events: Yes / No / Maybe.
- RSVP deadlines can be set per event.
- RSVP changes are allowed up to the deadline (or event start if no deadline set).

### 4. Event Dashboard

- Each event has a dashboard view showing:
  - List of confirmed Roll Models with count.
  - List of confirmed Riders with count, grouped by rider group.
  - List of "Maybe" responses.
  - List of those who have not yet responded.
  - Roll Model-to-Rider ratio indicator.
- Accessible to Admins and Roll Models. Parents see a simplified version (their own riders' status plus aggregate counts).

### 5. Groups

- Named groups of riders (e.g., "Shredders", "Trail Blazers", skill/age-based groupings).
- Riders are assigned to exactly one primary group.
- Roll Models can be assigned to one or more groups.
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

### 7. PWA

- Installable on mobile (Android and iOS) via "Add to Home Screen."
- Offline-capable: service worker caches the app shell and recently viewed data.
- Manifest with appropriate icons, theme color, and display mode (`standalone`).
- App should feel native — full-screen, no browser chrome, smooth transitions.

---

## Tech Stack

### Frontend

| Layer | Choice | Rationale |
|-------|--------|-----------|
| Framework | **Next.js 14+** (App Router) | SSR/SSG for performance, API routes for BFF, strong PWA ecosystem |
| Language | **TypeScript** (strict mode) | Type safety across the stack |
| Styling | **Tailwind CSS** | Utility-first, easy to theme for rugged aesthetic |
| Components | **shadcn/ui** | Accessible, composable primitives built on Radix UI |
| State | **React Query (TanStack Query)** | Server state caching, optimistic updates for RSVPs |
| Forms | **React Hook Form + Zod** | Validation with schema reuse between client and server |
| PWA | **next-pwa** or **Serwist** | Service worker generation, precaching, push support |
| Push Client | **Web Push API** | Browser-native push subscription management |

### Backend

| Layer | Choice | Rationale |
|-------|--------|-----------|
| Database | **Supabase (PostgreSQL)** | Managed Postgres with auth, realtime, storage, and RLS |
| Auth | **Supabase Auth** | Magic link + passkey support, JWT-based sessions |
| API | **Supabase client SDK + Next.js Route Handlers** | Direct DB access via RLS where possible; route handlers for complex logic |
| Push Server | **web-push** (Node.js library) | VAPID-based push message dispatch |
| Background Jobs | **pg_cron** (Supabase) or **custom worker** | Scheduled notification dispatch |
| File Storage | **Supabase Storage** | Profile photos, event images if needed |

### Infrastructure

| Layer | Choice | Rationale |
|-------|--------|-----------|
| Containerization | **Docker + Docker Compose** | App container + Supabase stack in parallel |
| App Container | **Node.js 20 Alpine** | Runs Next.js in production mode |
| Supabase Local | **supabase/docker** | Official self-hosted Supabase containers (Postgres, Auth, Realtime, REST, Storage) |
| Reverse Proxy | **Caddy** or **Traefik** (optional) | TLS termination, routing |

---

## Docker Compose Architecture

```
docker-compose.yml
├── app (Next.js — everybody.bike)
│   ├── Builds from ./Dockerfile
│   ├── Depends on supabase-db, supabase-auth, supabase-rest
│   └── Ports: 3000
├── supabase-db (PostgreSQL 15)
│   └── Ports: 5432
├── supabase-auth (GoTrue)
│   └── Ports: 9999
├── supabase-rest (PostgREST)
│   └── Ports: 3001
├── supabase-realtime
│   └── Ports: 4000
├── supabase-storage
│   └── Ports: 5000
└── supabase-studio (optional, dev only)
    └── Ports: 8080
```

Environment variables are managed via `.env` files (not committed; `.env.example` provided).

---

## Database Schema (Baseline)

### Tables

```
profiles
  id              UUID PK (references auth.users)
  full_name       TEXT NOT NULL
  email           TEXT NOT NULL
  role            TEXT[] NOT NULL  -- ['admin', 'roll_model', 'parent']
  avatar_url      TEXT
  created_at      TIMESTAMPTZ
  updated_at      TIMESTAMPTZ

riders
  id              UUID PK DEFAULT gen_random_uuid()
  parent_id       UUID FK -> profiles(id) NOT NULL
  first_name      TEXT NOT NULL
  last_name       TEXT NOT NULL
  group_id        UUID FK -> groups(id)
  date_of_birth   DATE
  emergency_contact TEXT
  medical_notes   TEXT
  created_at      TIMESTAMPTZ
  updated_at      TIMESTAMPTZ

groups
  id              UUID PK DEFAULT gen_random_uuid()
  name            TEXT NOT NULL UNIQUE
  color           TEXT NOT NULL DEFAULT '#6B7280'
  description     TEXT
  sort_order      INT DEFAULT 0
  created_at      TIMESTAMPTZ

roll_model_groups (join table)
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
  user_id         UUID FK -> profiles(id) NOT NULL       -- the person RSVPing
  rider_id        UUID FK -> riders(id)                   -- NULL if Roll Model RSVPing for self
  status          TEXT NOT NULL CHECK (status IN ('yes','no','maybe'))
  responded_at    TIMESTAMPTZ DEFAULT now()
  UNIQUE (event_id, user_id, rider_id)

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

- **profiles**: Users can read all profiles. Users can update only their own.
- **riders**: Parents can CRUD their own riders. Admins can CRUD all. Roll Models can read riders in their assigned groups.
- **groups**: All authenticated users can read. Admins can CRUD.
- **events**: All authenticated users can read events for their groups. Admins can CRUD.
- **rsvps**: Users can read RSVPs for events they can see. Users can insert/update their own RSVPs (or their riders' RSVPs). Admins can read all.
- **push_subscriptions**: Users can CRUD their own. No cross-user access.
- **scheduled_notifications**: Admins only.

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
├── docker-compose.yml
├── Dockerfile
├── .env.example
├── .gitignore
├── next.config.js
├── tailwind.config.ts
├── tsconfig.json
├── package.json
├── public/
│   ├── manifest.json
│   ├── sw.js                    # Service worker (generated)
│   ├── icons/                   # PWA icons (192, 512, maskable)
│   └── images/                  # Static images
├── src/
│   ├── app/                     # Next.js App Router
│   │   ├── layout.tsx           # Root layout (auth provider, theme)
│   │   ├── page.tsx             # Landing / dashboard
│   │   ├── login/
│   │   ├── events/
│   │   │   ├── page.tsx         # Event list
│   │   │   ├── [id]/
│   │   │   │   ├── page.tsx     # Event detail + dashboard
│   │   │   │   └── rsvp/
│   │   │   └── new/
│   │   ├── groups/
│   │   ├── notifications/
│   │   ├── profile/
│   │   └── admin/
│   │       ├── users/
│   │       ├── notifications/   # Schedule & send notifications
│   │       └── groups/
│   ├── components/
│   │   ├── ui/                  # shadcn/ui primitives
│   │   ├── events/
│   │   ├── rsvp/
│   │   ├── groups/
│   │   ├── notifications/
│   │   └── layout/              # Nav, header, footer, bottom bar
│   ├── lib/
│   │   ├── supabase/
│   │   │   ├── client.ts        # Browser Supabase client
│   │   │   ├── server.ts        # Server Supabase client
│   │   │   ├── middleware.ts     # Auth middleware
│   │   │   └── types.ts         # Generated DB types
│   │   ├── push.ts              # Web Push utilities
│   │   ├── validators.ts        # Zod schemas
│   │   └── utils.ts
│   ├── hooks/
│   │   ├── use-auth.ts
│   │   ├── use-events.ts
│   │   ├── use-rsvp.ts
│   │   └── use-push.ts
│   └── types/
│       └── index.ts
├── supabase/
│   ├── config.toml
│   ├── migrations/              # Numbered SQL migrations
│   │   └── 00001_initial_schema.sql
│   └── seed.sql                 # Dev seed data
└── tests/
    ├── unit/
    ├── integration/
    └── e2e/
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
- **Rate limiting**: Applied to auth endpoints and push subscription creation.
- **Data privacy**: Rider data (minors) treated as sensitive. Minimal data collection. No analytics tracking of children.

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
- Project scaffolding (Next.js, Tailwind, shadcn/ui, TypeScript).
- Docker Compose with Supabase containers.
- Database schema and migrations.
- Auth flow (magic link + passkey).
- Long-lived session configuration.
- Basic layout and navigation with rugged theme.

### Phase 2 — Core Features
- Event CRUD (with recurring event support).
- RSVP system.
- Event dashboard.
- Group management and assignment.

### Phase 3 — Notifications & PWA
- PWA manifest, service worker, installability.
- Web Push subscription management.
- Notification scheduling and targeting.
- Notification preferences UI.

### Phase 4 — Polish & Testing
- Comprehensive test suite (unit, integration, e2e).
- Offline support and sync.
- Dark mode.
- Performance optimization.
- Security hardening and audit.

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
