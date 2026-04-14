# Import Riders from ROOTZ Registration CSV

Import a ROOTZ master registration CSV into everybody.bike using the club CLI.
The CLI handles all database writes idempotently — it is safe to re-run.

## Before you start

1. Confirm the CLI is available:
   - **Local dev**: `node scripts/club-cli.js help`
   - **Production**: `docker compose exec app node scripts/club-cli.js help`
2. Confirm the groups in the CSV exist in the database: `group list`
3. Ask the user: "Where is the CSV file?" (get the path)

---

## ROOTZ CSV Column Reference

The CSV has these columns (header names vary slightly — normalize to lowercase + underscores):

| Normalized key        | Typical header text       | Notes |
|-----------------------|---------------------------|-------|
| `last_name`           | Last Name                 | |
| `first_name`          | First Name                | |
| `date_of_birth`       | Date of Birth             | Format: M/D/YYYY → convert to YYYY-MM-DD |
| `email`               | Email                     | For minors, this is the **parent's** email |
| `emergency_contact`   | Emergency Contact         | May contain parent name — use for name inference |
| `category_entered`    | Category Entered          | Primary classification signal (see below) |
| `riders_level`        | Riders Level / Level      | Skill level descriptor — informational only |
| `medical`             | Medical / Medical Notes   | Free-text medical info |
| `meds_yes_no`         | Meds-Yes-No / Meds        | "Yes" or "No" — whether rider takes medication |
| `media`               | Media / Media Consent     | "Yes" = consents, "No" = opt-out |

---

## Classification Logic

Classify each row as **adult_rider** or **minor_rider**:

1. **Primary signal** — `category_entered`:
   - Contains "Adult" → `adult_rider`
   - Contains "Youth" or "Junior" or a skill level like "Devo", "Intermediate", "Advanced" → `minor_rider`
   - Contains an age like "8-10", "11-13" → `minor_rider`
2. **Age fallback** — if `category_entered` is ambiguous, compute age from `date_of_birth`:
   - Age < 18 → `minor_rider`
   - Age ≥ 18 → `adult_rider`
3. **Skip rows** with missing required fields (`first_name`, `last_name`, `date_of_birth`, `email`).

---

## Processing Order

**Process adult riders before minor riders.** Minor rider creation requires the parent's profile to already exist.

### Step 1 — Ensure groups exist

For each unique group/level found in the CSV, create it if it doesn't exist:
```
group create --name "Shredders" --color "#EA580C"
```
Run `group list` first to see what's already there.

### Step 2 — Process adult riders

For each adult rider row:

```
user create --email "jane@example.com" --name "Jane Smith" --roles rider
```

Adult riders get **role `rider`** (not `roll_model` and not `parent` unless they also appear as a parent of a minor).

### Step 3 — Process minor riders

For each minor rider row:

1. The `email` column contains the **parent's** email, not the child's.
2. The parent must already exist (created in step 2, or already in the database).
3. If the parent is not yet in the database, create them first:
   ```
   user create --email "parent@example.com" --name "<inferred name>" --roles parent
   ```
4. Then create the rider:
   ```
   rider create \
     --first "Alex" \
     --last "Smith" \
     --dob "2015-03-22" \
     --parent-email "parent@example.com" \
     [--group "Shredders"] \
     [--medical "Carries EpiPen"] \
     [--media-opt-out]
   ```

---

## Data Transformations

### Date format
Convert M/D/YYYY → YYYY-MM-DD:
- `3/22/2015` → `2015-03-22`
- `11/5/2012` → `2012-11-05`

### Parent name inference (for minor rows with no parent in system)

When you need to create a parent profile but don't have a name, infer from:
1. **`emergency_contact` field** — if it contains a name (not a phone number), use it
2. **Email local part** — `jsmith@gmail.com` → "Jsmith" (best-effort)
3. **Fallback** — `"<LastName> Parent"` (e.g., "Smith Parent")

Tell the user which names were inferred and ask for corrections before sending invites.

### Medical notes
- Combine `medical` and `meds_yes_no` fields:
  - If `meds_yes_no` is "Yes" and `medical` is non-empty: use `medical` as-is
  - If `meds_yes_no` is "Yes" and `medical` is empty: use "Takes medication (details unknown)"
  - If `meds_yes_no` is "No" or empty, and `medical` is non-empty: use `medical` as-is
  - Skip if both are empty or "None"/"N/A"
- Pass as `--medical "..."` flag

### Media opt-out
- `media` = "No" → pass `--media-opt-out` flag
- `media` = "Yes" or empty → no flag (defaults to opted-in)

---

## Idempotency

All CLI commands are idempotent:
- `user create` with an existing email returns the existing profile without error
- `rider create` with an existing first+last+DOB updates the record without creating a duplicate
- `group create` with an existing name returns the existing group

Safe to re-run the whole import if it's interrupted.

---

## After import — send invites

Once all users and riders are created, offer to send invites:

```
# Send to a specific user
user invite --email "jane@example.com"

# Or review the pending list first
user list
```

Do NOT send invites automatically — ask the user if they want to send them, and to whom.

---

## Summary to report

When done, summarize:
- Groups created
- Adult riders created / already existed
- Minor riders created / already existed
- Parents created (new accounts needing invites)
- Rows skipped (missing required fields)
- Any rows that errored (with the error message)
- Names that were inferred for new parent accounts (so user can verify before inviting)
