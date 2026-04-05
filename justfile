# everybody.bike task runner

# --- Dev ---

# Start Docker (if needed), Supabase, and Next.js dev server
dev-setup:
    #!/usr/bin/env bash
    if ! docker info &>/dev/null; then
        echo "Starting Docker Desktop..."
        open -a Docker
        while ! docker info &>/dev/null; do
            sleep 1
        done
        echo "Docker Desktop is ready."
    fi
    npx supabase start
    npm run dev

# Start Next.js dev server
dev-serve:
    npm run dev

# Production build (local)
dev-build:
    npm run build

# Run linter
dev-lint:
    npm run lint

# Format code
dev-format:
    npm run format

# Run tests
dev-test:
    npm run test

# Run tests in watch mode
dev-test-watch:
    npm run test:watch

# Install dependencies
dev-install:
    npm install

# Start local Supabase stack
dev-db-start:
    npx supabase start

# Stop local Supabase stack
dev-db-stop:
    npx supabase stop

# Show local Supabase status and URLs
dev-db-status:
    npx supabase status

# Reset local database and re-seed
dev-db-reset:
    npx supabase db reset

# Apply pending migrations (local)
dev-db-migrate:
    npx supabase db push

# Create a new migration file
dev-db-migration-new name:
    npx supabase migration new {{name}}

# List migrations and their status
dev-db-migration-list:
    npx supabase migration list

# Regenerate Supabase TypeScript types
dev-db-types:
    npx supabase gen types --lang=typescript --local > src/lib/supabase/types.ts

# Open Supabase Studio in browser
dev-db-studio:
    open http://localhost:54323

# Open Inbucket (local email) in browser
dev-db-email:
    open http://localhost:54324

# --- Prod ---

# Start all production services
prod-up:
    docker compose up -d

# Stop all production services
prod-down:
    docker compose down

# View production logs (follow)
prod-logs *args:
    docker compose logs -f {{args}}

# Run production migrations
prod-migrate:
    docker compose run --rm migrate

# Rebuild and restart the app container only (keep Supabase running)
prod-restart-app:
    docker compose build app && docker compose up -d --no-deps app

# Destroy everything including volumes
prod-destroy:
    docker compose down -v --remove-orphans
