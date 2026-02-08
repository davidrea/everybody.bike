# everybody.bike

The scheduling and communications hub for a teaching mountain bike club. Built for club leaders, volunteer coaches ("Roll Models"), and the parents of young riders who are learning to shred.

**everybody.bike** is a Progressive Web App that handles event scheduling, RSVPs, group management, push notifications, and all the coordination that goes into getting kids (and adults!) out on the trails.

## What it does

- **Events & RSVPs** — Create rides, clinics, and social events. Roll Models and adult riders RSVP for themselves; parents RSVP for their kids.
- **Groups** — Organize riders by age or skill level. Assign coaches. Target events and notifications to specific groups.
- **Push Notifications** — Reminders, updates, and custom messages delivered straight to phones via the Web Push API. No app store required.
- **CSV Import** — Bulk onboard riders, parents, and coaches from a spreadsheet with smart deduplication.
- **Passwordless Auth** — Magic link and passkey login. No passwords to forget (or leak).

## Tech Stack

| Layer | Tech |
|-------|------|
| Frontend | Next.js (App Router), TypeScript, Tailwind CSS, shadcn/ui |
| Backend | Supabase (PostgreSQL, Auth, Realtime, Storage) |
| Push | Web Push API with VAPID |
| Infrastructure | Docker Compose |

## Getting Started

_TODO: Prerequisites (Node.js, Docker, Supabase CLI)_

_TODO: Clone, install, and configure environment variables_

_TODO: Start the local Supabase stack and dev server_

## Deployment

_TODO: Production Docker Compose setup_

_TODO: Environment variable reference_

_TODO: Database migrations in production_

_TODO: TLS and reverse proxy configuration_

## Development

_TODO: Running tests (Vitest, Playwright)_

_TODO: Database migrations workflow_

_TODO: Generating Supabase TypeScript types_

_TODO: Linting and formatting_

## License

_TODO_
