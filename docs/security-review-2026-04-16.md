# Codebase Review — 2026-04-16

A priority-ordered review of everybody.bike covering **security vulnerabilities**, **logic errors**, and **user experience issues**. Findings are verified against source; speculative items are called out. Severity reflects a youth-club context where minor-rider PII (name, DOB, medical notes) is the most sensitive data.

---

## CRITICAL / HIGH — Security

### S1. Minors' medical notes and DOB leak to every authenticated user
`supabase/migrations/20260208215707_initial_schema.sql:248-250` — `profiles_select` is `USING (true)`. All authenticated users can read every row of `profiles` including `medical_alerts` (sensitive PHI) and `email`. Children's `medical_notes` and `date_of_birth` are **also** exposed by `/api/events/[id]/dashboard` (`src/app/api/events/[id]/dashboard/route.ts:77, 194`), which returns the full rider payload (including `medical_notes` and `media_opt_out`) to any authenticated session — no role check. Even if RLS were tighter on `riders`, the dashboard route uses the user-scoped client but still trusts the session to decide what to return.

Fix: restrict `profiles_select` to self + admin (add a role-scoped policy for roll_models/adult riders that omits `medical_alerts`), and gate the dashboard endpoint on `is_admin() OR has_role('roll_model')`.

### S2. Calendar feed token is readable by every authenticated user → calendar hijack
`supabase/migrations/20260209190000_calendar_feed_tokens.sql` adds `calendar_token` to `profiles`, and `profiles_select` exposes the full row. Any user can run `select id, calendar_token from profiles` and subscribe to another user's ICS feed via `/api/calendar/[token]` (`src/app/api/calendar/[token]/route.ts:40-44`) — that endpoint is intentionally unauthenticated (token is the bearer) and returns every event + location for the target user.

Fix: move `calendar_token` to a separate, owner-only-SELECT table, or add a column-level `GRANT`/view. Also make the token rotatable and record last-used timestamps.

### S3. RSVP UPDATE has no `WITH CHECK` — users can rewrite `user_id`/`rider_id`
`supabase/migrations/20260208215707_initial_schema.sql:447-459` — `rsvps_update_own` defines `USING (...)` but omits `WITH CHECK`. The `20260211000000_security_hardening.sql` pass fixed `profiles_update_own` the same way but left RSVPs. A parent who owns an RSVP row can `UPDATE` it to set `user_id` to someone else or `rider_id` to a rider they aren't linked to.

Fix: add `WITH CHECK` mirroring the USING clause.

### S4. Any admin can invite a super_admin — privilege escalation
`src/app/api/admin/invite/route.ts:34-107` — the role check is `admin OR super_admin`, but the `roles` array from `inviteSchema` is written through without restriction (line 102). Meanwhile `src/app/api/admin/users/[id]/roles/route.ts:64-81` correctly requires super_admin to grant admin/super_admin. So the invite endpoint is the escalation path: an admin invites an attacker email with `roles: ["super_admin"]`.

Fix: mirror the roles-route check — non-super-admins cannot assign `admin` or `super_admin`. Apply the same filter in `admin/import/commit` for the adults path (currently guarded by the `IMPORTABLE_ROLES` allowlist at line 11 — that file is safe).

### S5. Admins can silently change a user's email with no verification → account takeover
`src/app/api/admin/users/[id]/route.ts:91-132` calls `admin.auth.admin.updateUserById({ email })` directly. No confirmation email, no verification step. Combined with the magic-link-only login, a rogue admin can change a target's email to an address they control and immediately log in as them.

Fix: use Supabase's email-change flow (`email_confirm: false` and force re-verification), or require the target user to confirm via a token.

### S6. Passkey challenge stored in `auth.users.user_metadata`
`src/app/api/auth/passkey/register/route.ts:61-63` writes the WebAuthn challenge into `user_metadata`. `user_metadata` is returned to the client on every `getUser()` call and is **not** single-use — nothing clears it after verify, and the verify route can be replayed with the same challenge until a new GET overwrites it. Also not TTL-bounded in the DB.

Fix: store challenges in a dedicated `webauthn_challenges` table (user_id, challenge, expires_at), consume on verify, or use an httpOnly cookie (as the login flow correctly does at `src/app/api/auth/passkey/login/route.ts:30-36`).

### S7. WebAuthn RP ID derived from untrusted headers
`src/lib/passkey.ts:40-58` — `getRpIDFromHeaders` / `getOriginFromHeaders` trust `x-forwarded-host` and `x-forwarded-proto` with no allowlist. `src/lib/url.ts` already maintains an `ALLOWED_HOSTS` list; passkey.ts doesn't use it. Behind a misconfigured proxy (or if the Next.js app is ever reachable directly), an attacker can point WebAuthn at `attacker.com` and register a credential that the server will later accept.

Fix: validate the forwarded host against `ALLOWED_HOSTS` (or a dedicated `PASSKEY_RP_ID` env var); fall back to a hardcoded production value.

---

## MEDIUM — Security

### S8. CSV import preview/commit are decoupled (TOCTOU)
`src/app/api/admin/import/commit/route.ts:39-60` accepts a fresh `csv_text` body and re-parses it. An admin clicks "Commit" after seeing a preview, but the browser can POST entirely different CSV content. Low likelihood (needs admin session + ability to swap request), but it defeats the "preview first" safety contract. `parent_name_overrides` on line 58 is typed but not Zod-validated, so huge strings / unexpected keys aren't rejected.

Fix: hash the CSV text server-side during preview, return an opaque token, and commit against the token only. Zod-validate `parent_name_overrides`.

### S9. No body-size limit on CSV endpoints
`src/app/api/admin/import/preview/route.ts` and `commit/route.ts` JSON-parse the entire request before measuring length. Next.js's default body limit is generous; a 50MB CSV will be loaded into memory and parsed row-by-row. DoS risk for small self-hosted instances.

Fix: reject bodies > ~1MB; enforce in both preview and commit.

### S10. Notification dispatch duplicates on parallel cron
`src/app/api/admin/notifications/dispatch/route.ts` selects `sent=false`, sends, then sets `sent=true`. No `FOR UPDATE SKIP LOCKED`, no unique partial index, no atomic select-and-claim. If cron fires twice (restart, network retry), users receive duplicate pushes.

Fix: wrap in a transaction with `SELECT ... FOR UPDATE SKIP LOCKED`, or use an advisory lock, or mark `sent=true` (with a "claimed_at") before dispatch and reverse on failure.

### S11. Onboarding complete has no state check
`src/app/api/onboarding/complete/route.ts:11-23` lets any authenticated user set their own `invite_status='accepted'` at any time. Low impact (field is not authorization-bearing), but it lets users skip onboarding steps and breaks the "pending vs accepted" invariant used elsewhere.

Fix: require `invite_status='pending'` before flipping; or remove the flip entirely and infer "accepted" from presence of riders / passkey / profile edits.

### S12. IP-based rate limiting with `unknown` bucket
`src/lib/rate-limit.ts:88-95` falls back to the string `"unknown"` when `cf-connecting-ip` and `x-forwarded-for` are missing. All such requests share one bucket — on a misconfigured proxy, legitimate traffic could rate-limit itself out. Conversely, `x-forwarded-for` is trusted without verifying the proxy chain, so an attacker hitting the app directly can rotate the header to bypass limits.

Fix: require at least one trusted header in production (log + fail-closed if absent), and only read the rightmost entry from a known trusted proxy.

### S13. Rate limiter is in-process only
`src/lib/rate-limit.ts` uses a module-level Map. In a multi-replica deployment (the Docker Compose file scales the `app` service straightforwardly) limits are per-instance. Not currently exploitable if there's only one replica, but worth noting before scale-out.

### S14. Event dashboard is open to all authenticated users
Covered in S1, but worth restating as a distinct fix: add `is_admin OR has_role('roll_model') OR has_role('rider')` check at the top of `src/app/api/events/[id]/dashboard/route.ts` and omit `medical_*` fields for non-admins.

### S15. OTP expiry set to 12 hours
`supabase/config.toml` sets `otp_expiry = 43200` (12 hours). This was raised intentionally per the CLAUDE.md changelog but is well above industry norms (5-15 min). If an email account is compromised even briefly, a 12-hour-old OTP is still valid.

Fix: lower to 900-1800 seconds; the 90-day refresh-token session already covers the "convenience" argument.

---

## LOW — Security / hardening

- **S16**: `/api/auth/passkey/login/verify` returns "Credential not found" vs verification failure with distinct messages (`src/app/api/auth/passkey/login/verify/route.ts:44`) — use a single generic message.
- **S17**: `isSafeHttpUrl` in the dispatch route (`src/app/api/admin/notifications/dispatch/route.ts:273-280`) uses regex rather than `new URL(...)` + protocol allowlist; not currently exploitable but brittle.
- **S18**: No audit log for admin-sensitive actions (role changes, email changes, user deletions). All three currently rely on `logger.info` only, which writes to stdout and isn't queryable.
- **S19**: `docker-compose.yml` exposes Studio routes through Kong — ensure Kong's basic-auth gate is enforced in production (`volumes/api/kong.yml`).

---

## HIGH — Logic errors

### L1. `profiles_insert_admin` permits admins to create profiles that never link to `auth.users`
`supabase/migrations/20260208215707_initial_schema.sql:259-261` — RLS allows any admin to `INSERT INTO profiles` with arbitrary `id`. The invite flow always creates the auth user first, but manual DB access (or a future buggy route) could create orphan profiles. Either keep as-is and document, or drop the policy in favor of the admin-client-only invite flow (which is already how it's used in practice).

### L2. RSVP timezone bug
`src/components/rsvp/rsvp-controls.tsx:69-71` — `new Date() > new Date(event.rsvp_deadline)` is fine (both parsed as absolute time); flagged by an exploration agent but **not** a bug. However `src/components/events/event-form.tsx` datetime-local handling needs a direct check — the `toDatetimeLocal` helper converts UTC → local for input, but on submit it passes local-as-UTC to the server, silently shifting times by the user's offset. Check line ~396-400. Recommend verifying with a DST test.

### L3. Race condition on minor RSVPs by co-parents
The DB partial unique indexes on `rsvps` (per CLAUDE.md) ensure one-row-per-rider, but the application's upsert path needs to handle conflicts gracefully. Spot-check `/api/rsvps/route.ts` for `on conflict (event_id, rider_id)` handling.

### L4. Query invalidation too broad
`src/hooks/use-rsvp.ts:90-94` invalidates `["rsvps", "bulk"]` without event-scoped key, so every bulk-RSVP view in the app refetches after any mutation. UX-visible flicker + server load.

### L5. `useAuth` silently logs out on API errors
`src/hooks/use-auth.ts:29-31` treats any non-2xx from `/api/auth/me` as signed-out. A transient 500 boots the user to login. Distinguish 401 vs 5xx; surface an error state.

### L6. Recurring-event edit "single vs series"
Flagged in the exploration pass — worth a targeted test: create weekly series, edit one occurrence, verify the series unchanged; edit series, verify occurrence override preserved.

---

## MEDIUM — UX

- **U1**: Notification permission banner shows on first page load (`src/components/layout/notification-prompt-banner.tsx:38`). Defer to after meaningful engagement.
- **U2**: No offline indicator. Next.js 16 + custom SW doesn't surface network state; submitting an RSVP offline fails with generic "fetch failed" toast.
- **U3**: Destructive actions (cancel event, delete rider, remove rider-parent link) should all show a confirmation dialog consistently. Spot-check `event-detail.tsx`.
- **U4**: Submit buttons not uniformly `disabled={isPending}` — allows double-submit on slow networks (notably `event-form`, `invite-form`, `rsvp` controls).
- **U5**: Icon-only buttons (bottom-nav, header avatar dropdown, dismiss buttons) missing `aria-label` — WCAG 2.1 AA violation.
- **U6**: Empty states across `app/page.tsx`, `/events`, `/groups` are text-only; no CTAs for admins to create, no reassurance for parents ("check back").
- **U7**: `manifest.json` icon entry uses `"sizes": "any"` for a single favicon — browsers expect discrete 192px and 512px PNGs. PWA may not install cleanly on some Android devices.
- **U8**: Hardcoded greens/oranges in RSVP button group may fail WCAG AA contrast in dark mode. Worth a Lighthouse pass.
- **U9**: Recurring-edit dialog copy "all future events" is ambiguous — clarify "This and all later occurrences".
- **U10**: Service worker push click handler doesn't surface failures (`public/sw.js:20-22`).

---

## Priority fix list (recommended order)

1. **S1 + S14**: Tighten `profiles_select` and gate dashboard route — stops minor medical-info leak.
2. **S2**: Move `calendar_token` off `profiles` (or add column-level protection) — stops feed hijack.
3. **S3**: Add `WITH CHECK` to `rsvps_update_own` — stops RSVP forgery.
4. **S4**: Restrict role assignment in `/api/admin/invite` — closes privilege escalation.
5. **S5**: Require verification on admin-driven email change — stops silent takeover.
6. **S6 + S7**: Move passkey challenge to a dedicated table and constrain RP ID.
7. **S8 + S9**: Nonce/hash on CSV preview→commit + body-size cap.
8. **S10**: Atomic claim on notification dispatch.
9. **S15**: Lower OTP expiry.
10. **L5 + U1 + U2**: Auth error surfacing, notification-prompt timing, offline indicator (quick UX wins).

---

## What I did NOT verify end-to-end

- Playwright/Vitest coverage gaps (noted as an open issue in CLAUDE.md).
- Actual Kong/Supabase rate limits at the gateway.
- Lighthouse/a11y scores.
- Recurrence RRULE edge cases (DST, 5th-weekday-of-month).
- That SMTP templates render correctly across clients.

Each of the above is worth a follow-up pass.
