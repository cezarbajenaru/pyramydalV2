# Login/Auth Plan (Root, Admin, User)

## Goal

Add secure login/logout with role-based access:
- `root` = creator/superuser, full system control.
- `admin` = factory admin, manage operational data/users in own scope.
- `user` = normal operator, limited CRUD.

No auth yet in code. This file is implementation sketch + best practices.

## Principles

- Deny by default.
- Least privilege.
- Server-side authorization only (never trust UI role checks alone).
- Audit all privileged actions.
- Use battle-tested auth stack, not custom crypto.

## Recommended Auth Model

- Session-based auth with secure HTTP-only cookies.
  - Better for internal business app.
  - Lower token leakage risk vs localStorage JWT.
- Password login first; SSO can come later.
- Short session TTL + rolling refresh.

## Role Model (RBAC v1)

- `root`
  - Manage all users, all roles, all factories/scopes.
  - Can assign/revoke `admin`.
  - Can see security/audit screens.
- `admin`
  - Manage users in assigned factory scope.
  - CRUD main rows + reference lists for that scope.
  - Cannot escalate to `root`.
- `user`
  - Read + limited write on production rows.
  - No user management.
  - No role assignment.

## Data Model Changes (Backend/DB)

Add core tables:
- `app.users`
  - `id`, `email` (unique), `password_hash`, `display_name`, `is_active`
  - `created_at`, `updated_at`, `last_login_at`
- `app.roles`
  - `id`, `name` (`root|admin|user`)
- `app.user_roles`
  - `user_id`, `role_id` (many-to-many)
- `app.sessions`
  - `id`, `user_id`, `refresh_token_hash`, `expires_at`, `revoked_at`, `ip`, `user_agent`
- `app.audit_log`
  - `actor_user_id`, `action`, `resource_type`, `resource_id`, `details_json`, `created_at`

### Change Traceability Requirements (Main Rows)

- Track every `main_rows` create/update/delete as user-attributed events.
- Capture field-level before/after for updates (diff, not full snapshot only).
- Required metadata per event:
  - `actor_user_id`
  - `actor_role`
  - `session_id`
  - `request_id`
  - `ip`
  - `user_agent`
  - `resource_type` (`main_rows`)
  - `resource_id` (`main_rows.id`)
  - `action` (`create|update|delete|recalc_trigger`)
  - `changed_fields_json` (before/after pairs)
  - `created_at`
- Root can view global history; admin sees scoped history; user sees own actions (or no audit UI, policy decision).
- Retention target: minimum 12 months hot + archive strategy for long-term compliance.

Recommended table:
- `app.main_rows_change_log`
  - `id BIGSERIAL`
  - `main_row_id BIGINT`
  - `actor_user_id BIGINT`
  - `actor_role VARCHAR(50)`
  - `action VARCHAR(50)`
  - `changed_fields_json JSONB`
  - `session_id UUID`
  - `request_id UUID`
  - `ip INET`
  - `user_agent TEXT`
  - `created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP`

Optional later:
- `app.user_factory_scope` if per-factory isolation needed.

## API Endpoints (v1)

- `POST /api/auth/login`
  - Input: email + password.
  - Output: set secure cookie session; return basic profile.
- `POST /api/auth/logout`
  - Revoke session; clear cookie.
- `GET /api/auth/me`
  - Return authenticated user + role list.
- `POST /api/auth/users` (`root` / scoped `admin`)
  - Create user.
- `PATCH /api/auth/users/{id}` (`root` / scoped `admin`)
  - Update user active status/display name.
- `POST /api/auth/users/{id}/roles` (`root`)
  - Assign roles.

## UI Changes (v1)

- Add top-right auth area:
  - Login button when anonymous.
  - User menu + Logout when authenticated.
- Add `/login` page (email/password form).
- Add route guard:
  - Unauthenticated => redirect login.
- Add role guard:
  - Hide/disable unauthorized actions in UI.
  - Keep server enforcement as source of truth.

## Password + Session Security

- Hash passwords with Argon2id (preferred) or bcrypt (cost tuned).
- Never store plain passwords.
- Cookie flags:
  - `HttpOnly`, `Secure`, `SameSite=Lax` (or `Strict` if possible).
- CSRF protection for state-changing routes (token or same-site strategy).
- Brute-force defenses:
  - login rate limiting
  - temporary lockout/backoff
- Rotation/revocation:
  - revoke on logout
  - admin can invalidate all sessions for user

## Authorization Enforcement Map (initial)

- Main row read: `user|admin|root`
- Main row create/update: `user|admin|root`
- Main row delete: `admin|root` (recommended)
- Reference lists write: `admin|root`
- User/role management: `root` (and scoped admin where allowed)

## Bootstrap Strategy

First deploy must create initial `root` safely:

1. Migration adds auth tables.
2. One-time bootstrap command creates root user from env vars:
   - `BOOTSTRAP_ROOT_EMAIL`
   - `BOOTSTRAP_ROOT_PASSWORD`
3. Command disabled after first successful run.
4. Rotate bootstrap password immediately after first login.

## Rollout Plan

### Phase 1: Foundation
- DB migrations for users/roles/sessions/audit.
- Login/logout/me endpoints.
- Password hashing + cookie sessions.

### Phase 2: Guards
- Backend middleware for auth + role checks.
- Protect existing `/api/main-rows*` endpoints.
- Add audit log on create/update/delete.

### Phase 3: UI
- Login page.
- Header login/logout.
- Route + action guards.

### Phase 4: Admin
- Basic user management screen.
- Role assignment (root only).

## Testing Checklist

- Login success/failure, logout, session expiry.
- Unauthorized user blocked from protected endpoints.
- Role boundaries: user cannot access admin/root operations.
- Delete endpoint blocked for non-admin if policy says so.
- Cookie security attributes verified in browser.
- Audit rows written for privileged actions.

## Common Mistakes to Avoid

- Storing JWT in localStorage.
- Client-only role checks without backend enforcement.
- Custom password hashing implementation.
- Missing rate limits on login.
- Allowing `admin` to self-promote to `root`.

## Suggested Next Implementation Step

Start with backend auth foundation only:
1. Add auth schema migration.
2. Implement `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`.
3. Add middleware and protect one endpoint (`GET /api/main-rows`) first.
