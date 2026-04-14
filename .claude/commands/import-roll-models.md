# Import Roll Models

Import a list of Roll Models (volunteer coaches) into everybody.bike using the club CLI.
All CLI commands are idempotent — safe to re-run.

## Before you start

1. Confirm the CLI is available:
   - **Local dev**: `node scripts/club-cli.js help`
   - **Production**: `docker compose exec app node scripts/club-cli.js help`
2. Ask the user: "Where is the roll model list?" (CSV, spreadsheet paste, or plain text — any format works)

---

## Input format

The roll model list can be in any format. You just need:
- **Name** (full name)
- **Email** (required — this is how users are identified)
- **Group assignment** (optional — which rider group(s) they coach)

Common formats you'll see:
- CSV with columns: `name`, `email`, `group`
- Spreadsheet paste: tab-separated or space-aligned
- Plain text: "Jane Smith, jane@example.com, Shredders"
- Email thread copy-paste with mixed formatting

Parse whichever format is provided. Ask for clarification only if you genuinely can't extract names and emails.

---

## Processing steps

### Step 1 — Create each roll model's account

For each person:

```
user create --email "jane@example.com" --name "Jane Smith" --roles roll_model
```

If the user already exists in the system (returns `action: existing`), their roles will not be changed by `user create`. Add the role explicitly:

```
user add-role --email "jane@example.com" --role roll_model
```

### Step 2 — Assign to groups (if provided)

If the list includes group assignments, ensure the group exists first:

```
group list
group create --name "Shredders" --color "#EA580C"   # only if not already listed
```

Then assign:

```
group assign-rm --group "Shredders" --email "jane@example.com"
```

A roll model can be assigned to multiple groups — run `group assign-rm` once per group.

---

## After import — send invites

Once all roll models are created, offer to send invites. Do NOT send automatically — confirm with the user first.

```
user invite --email "jane@example.com"
```

To review who is still pending before inviting:

```
user list --role roll_model
```

---

## Summary to report

When done, tell the user:
- Roll models created (new accounts)
- Roll models already in the system (no change needed, or role added)
- Group assignments made
- Any rows skipped or errored (with reason)
- Who still needs an invite sent
