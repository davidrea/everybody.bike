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
| Frontend | Next.js 16 (App Router), TypeScript, Tailwind CSS v4, shadcn/ui |
| Backend | Supabase (PostgreSQL, Auth, Realtime, Storage) |
| Push | Web Push API with VAPID |
| Infrastructure | Docker Compose (self-hosted Supabase) |

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) 22+
- [Supabase CLI](https://supabase.com/docs/guides/cli) (`npm install -g supabase`)
- [Docker](https://docs.docker.com/get-docker/) (for local Supabase stack and production deployment)

### Local Development Setup

```bash
# Clone the repo
git clone https://github.com/yourusername/everybody.bike.git
cd everybody.bike

# Install dependencies
npm install

# Copy env template and fill in values
cp .env.example .env.local

# Start the local Supabase stack
npx supabase start
# Note the API URL, anon key, and service role key from the output.
# The service role key may appear as "Secret" in the CLI.
# Paste them into .env.local (or .env if you prefer one file).

# Apply seed data (optional, for dev)
npx supabase db reset

# Start the dev server
npm run dev
```

The app will be at http://localhost:3000. Supabase Studio is at http://localhost:54323, and Inbucket (email testing) at http://localhost:54324.

### Dev Bootstrapping (First Super Admin)

For local dev, you can still use the bootstrap script. It now auto-detects the
service role key from `supabase status` if `SERVICE_ROLE_KEY` is not set,
so it won't break production deployments that rely on `.env`.

```bash
# With local Supabase running
bash scripts/bootstrap-admin.sh --email you@example.com --name "Your Name"
```

## Deployment

### Architecture

The production stack runs as Docker Compose services on a VPS:

```
  Internet
     │
  Cloudflare Tunnel (HTTPS)
     │
     ├── everybody.bike     → app:3000   (Next.js)
     └── api.everybody.bike → kong:8000  (Supabase API Gateway)

  Internal Docker network:
     kong → auth, rest, realtime, storage
     app  → kong (server-side, via SUPABASE_URL)
     db   ← all services
     cron → app (notification dispatch every 2 min)
```

### First-Time Setup

```bash
# 1. Clone the repo on your VPS
git clone https://github.com/yourusername/everybody.bike.git
cd everybody.bike

# 2. Create your .env file
cp .env.production.example .env

# 3. Generate Supabase infrastructure secrets
bash scripts/generate-keys.sh
# Copy the output into your .env file

# 4. Generate VAPID keys for push notifications
npx web-push generate-vapid-keys
# Paste the public and private keys into .env

# 5. Generate notification dispatch secret
openssl rand -hex 32
# Paste as NOTIFICATION_DISPATCH_SECRET in .env

# 6. Edit .env — fill in:
#    - SITE_URL (e.g., https://everybody.bike)
#    - API_EXTERNAL_URL (e.g., https://api.everybody.bike)
#    - SMTP credentials (Mailgun, SendGrid, etc.)
#    - DASHBOARD_USERNAME / DASHBOARD_PASSWORD (for Supabase Studio)

# 7. Verify SMTP is working (before you need it!)
node scripts/verify-smtp.js
# Or without Node.js installed:
# docker run --rm --env-file .env -v "$(pwd)/scripts:/scripts" node:22-alpine node /scripts/verify-smtp.js

# 8. Build the app
docker compose build app

# 9. Start everything
docker compose up -d

# 10. Apply app database migrations (first time only)
docker compose run --rm migrate

# 11. Verify all services are healthy
docker compose ps

# 12. Bootstrap the first super_admin (no email needed!)
bash scripts/bootstrap-admin.sh --email you@example.com --name "Your Name"
# This prints a magic link URL and OTP code to your terminal.
# Open the link or enter the OTP on the login page.
```

### Cloudflare Tunnel

Add a `cloudflared` service to your `docker-compose.yml` (or run it separately) that maps:

| Public hostname | Service | Port |
|----------------|---------|------|
| `everybody.bike` | `app` | 3000 |
| `api.everybody.bike` | `kong` | 8000 |

Set `CLOUDFLARE_TUNNEL_TOKEN` in your `.env`.

### Updating

```bash
git pull
docker compose build app
docker compose up -d app

# If there are new database migrations:
docker compose run --rm migrate
```

### Database Migrations

Migrations are in `supabase/migrations/` as sequential SQL files.

- **First deploy**: Migrations auto-apply when the database initializes (mounted into the Postgres container's init directory).
- **Subsequent migrations**: Run `docker compose run --rm migrate` after pulling new code.
- **Alternative**: Use the Supabase CLI from any machine: `supabase db push --db-url postgres://postgres:PASSWORD@your-vps:5432/postgres`

### Environment Variables

See `.env.production.example` for the complete list with documentation. Key groups:

| Group | Variables |
|-------|-----------|
| URLs | `SITE_URL`, `API_EXTERNAL_URL`, `ADDITIONAL_REDIRECT_URLS` |
| Supabase secrets | `JWT_SECRET`, `ANON_KEY`, `SERVICE_ROLE_KEY`, `POSTGRES_PASSWORD` |
| SMTP | `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` |
| Push | `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` |
| Cron | `NOTIFICATION_DISPATCH_SECRET` |
| WebAuthn | `WEBAUTHN_RP_ID`, `WEBAUTHN_ORIGIN` (use `auto` behind Cloudflare) |

## Development

### Commands

| Command | Purpose |
|---------|---------|
| `npm run dev` | Start Next.js dev server |
| `npm run build` | Production build |
| `npm run lint` | ESLint check |
| `npm run format` | Prettier format |
| `npm run test` | Run Vitest (unit + integration) |
| `npm run test:e2e` | Run Playwright e2e tests |
| `npm run db:types` | Regenerate Supabase TypeScript types |
| `npm run db:migrate` | Apply pending database migrations (local) |
| `npm run db:reset` | Reset local database and re-seed |

### Database Migrations (Local)

```bash
# Create a new migration
npx supabase migration new my_description

# Edit the generated file in supabase/migrations/

# Apply all migrations (resets DB)
npx supabase db reset

# Regenerate TypeScript types
npm run db:types
```

### Project Structure

```
everybody.bike/
├── docker-compose.yml        # Production: Supabase + app + cron
├── Dockerfile                # Multi-stage Next.js build
├── .env.production.example   # Production env template
├── src/
│   ├── app/                  # Next.js App Router (pages + API routes)
│   ├── components/           # React components (ui, events, admin, etc.)
│   ├── hooks/                # React Query hooks (BFF data fetching)
│   ├── lib/                  # Supabase clients, validators, utilities
│   └── types/                # TypeScript types
├── supabase/
│   ├── migrations/           # SQL migration files
│   ├── templates/            # Email templates (invite, magic_link)
│   └── config.toml           # Local dev config
├── volumes/                  # Supabase Docker init scripts
├── scripts/                  # generate-keys.sh, crontab
└── public/                   # PWA manifest, service worker, icons
```

## License

MIT
