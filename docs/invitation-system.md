# Invitation System (Closed Beta)

> How the invite-code gate works, how to manage it, and how to open the platform to the public.

## Overview

OpenOrbis uses an **invite-code activation gate** for the closed beta launch. The system works as follows:

1. **Anyone can register** via Google or LinkedIn OAuth — a `Person` node is always created.
2. **After login**, if invite codes are required, non-admin users without a valid code are blocked on the `/activate` page and cannot access the platform.
3. **Each invite code is single-use** — once consumed by a user, it cannot be reused.
4. **Admins bypass the gate** entirely and are never asked for a code.
5. **The gate can be turned off** from the admin dashboard, opening the platform to everyone.

This design ensures we always capture user data (email, name, provider) regardless of whether they have a code, making it easy to reach out later when we open up.

## How Activation Works

When a user logs in, the `GET /auth/me` endpoint computes an `activated` flag:

```
activated = !invite_code_required OR is_admin OR signup_code IS NOT NULL
```

- `invite_code_required` — runtime toggle stored in the `:BetaConfig` Neo4j node
- `is_admin` — boolean flag on the `Person` node
- `signup_code` — set when the user successfully submits a code on `/activate`

The frontend `ProtectedRoute` component checks `user.activated` and redirects to `/activate` if false. The `/activate` page itself uses `AuthenticatedRoute` (requires login but not activation).

## Data Model

### Neo4j Nodes

**`:AccessCode`** — single-use invite codes

| Field | Type | Description |
|-------|------|-------------|
| `code` | string (UNIQUE) | The code string users enter |
| `label` | string | Channel tag (e.g. "newsletter", "twitter") for attribution |
| `active` | boolean | Can be deactivated without deleting |
| `used_at` | datetime | When the code was consumed (null if available) |
| `used_by` | string | `user_id` of the Person who used it |
| `created_at` | datetime | When the code was created |
| `created_by` | string | `user_id` of the admin who created it |

**`:BetaConfig`** — singleton configuration node

| Field | Type | Description |
|-------|------|-------------|
| `singleton` | string (UNIQUE) | Always `'global'` — ensures only one node exists |
| `invite_code_required` | boolean | Master switch. `true` = codes required, `false` = open platform |
| `updated_at` | datetime | Last modification timestamp |

**`Person` fields** (added to existing node)

| Field | Type | Description |
|-------|------|-------------|
| `signup_code` | string or null | The invite code used to activate. Null = not yet activated |
| `is_admin` | boolean | Admin flag. Grants access to `/admin` and bypasses the activation gate |

## Admin Dashboard

The admin dashboard is accessible at `/admin` (or via the UserMenu dropdown, visible only for admins). It provides:

### Stats Overview
- Registered users count
- Users pending activation (registered but no code)
- Invite codes: total / used / available
- Toggle button: "Codice invito: OBBLIGATORIO" / "Piattaforma: APERTA A TUTTI" (with confirmation dialog)

### Codici Invito Tab
- **Create single code** — specify code name + optional label
- **Create batch** — specify prefix + count + optional label (generates codes like `prefix-a1b2c3`)
- **Filter** — All / Available / Used
- **Table** — code (click to copy), label, status, used by, created date, actions (activate/deactivate, delete)

### Utenti in Attesa Tab
- Table of registered users without a `signup_code`: name, email, provider, registration date

## CLI Commands

### Grant Admin

The first admin must be created via CLI (chicken-and-egg: the admin endpoints require an admin to exist).

```bash
cd backend

# By user_id (find it in Neo4j Browser or via GET /auth/me)
uv run python -m scripts.grant_admin --user-id google-112726584537002607480

# By email (decrypts all Person emails to find a match — works only if ENCRYPTION_KEY is set consistently)
uv run python -m scripts.grant_admin --email you@example.com

# Revoke admin
uv run python -m scripts.grant_admin --user-id google-112726584537002607480 --revoke
```

**Note:** The `--email` lookup decrypts every Person's email using the Fernet key from `ENCRYPTION_KEY`. If you're using the auto-generated dev key (empty `ENCRYPTION_KEY`), the script will generate a different random key and fail to match. Use `--user-id` in that case.

### Create Invite Codes via API

Once you're admin, you can create codes from the dashboard UI or via curl:

```bash
# Single code
curl -X POST http://localhost:8000/admin/access-codes \
  -H "Authorization: Bearer <your-jwt>" \
  -H "Content-Type: application/json" \
  -d '{"code": "invito-mario", "label": "amici"}'

# Batch (generates 50 codes with prefix "launch")
curl -X POST http://localhost:8000/admin/access-codes/batch \
  -H "Authorization: Bearer <your-jwt>" \
  -H "Content-Type: application/json" \
  -d '{"prefix": "launch", "count": 50, "label": "launch-day"}'
```

## Opening the Platform

When you're ready to exit closed beta:

1. Go to `/admin`
2. Click the toggle "Codice invito: OBBLIGATORIO"
3. Confirm in the dialog → becomes "Piattaforma: APERTA A TUTTI"

This sets `invite_code_required = false` on the `:BetaConfig` node. All existing and new users are immediately activated — no code needed. The change is instant and reversible (click the toggle again to re-enable).

Alternatively, set `INVITE_ONLY_REGISTRATION=false` in the `.env` file and restart the backend. This is a hard override that bypasses the DB toggle entirely.

## API Endpoints

See [api.md](api.md) for the full reference. Key endpoints:

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/auth/activate` | JWT | Consume invite code, activate user |
| GET | `/admin/stats` | Admin | Stats overview |
| GET | `/admin/beta-config` | Admin | Read invite_code_required |
| PATCH | `/admin/beta-config` | Admin | Toggle invite_code_required |
| GET | `/admin/access-codes` | Admin | List all codes |
| POST | `/admin/access-codes` | Admin | Create single code |
| POST | `/admin/access-codes/batch` | Admin | Batch create codes |
| PATCH | `/admin/access-codes/{code}` | Admin | Activate/deactivate code |
| DELETE | `/admin/access-codes/{code}` | Admin | Delete unused code |
| GET | `/admin/pending-users` | Admin | List users awaiting activation |
