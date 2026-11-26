# Audit Report: Auth Middleware, JWT & OAuth 2.0 Segregation (`AUD-AUTH-OAUTH-2026-11-24`)

## 1. Audit Metadata & Scope
- **Audit ID**: `AUD-AUTH-OAUTH-2026-11-24`
- **Audit Date**: 2026-11-24 22:53 (UTC+3)
- **Target Scope**: Authentication Middleware (`middleware/auth.ts`), JWT & Password Crypto (`utils/auth.ts`), Auth Router (`routes/auth.ts`), and Admin OAuth 2.0 Routes (`routes/messages.ts` & `oauth2Service.ts`)
- **Branch**: `feature/frontend-redesign`
- **Commit**: `d7bf228`
- **Governing Standards**: [`AGENTS.md`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/AGENTS.md) (Rule 14) & [`code-audit`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/.agents/skills/code-audit/SKILL.md)
- **Audit Mode**: Remediated & Certified (`FULL SIGN-OFF` on 2026-11-26 via [`SIGN-OFF-AUTH-OAUTH-2026-11-26.md`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/agent-handoffs/audit/sign-off/SIGN-OFF-AUTH-OAUTH-2026-11-26.md))

---

## 2. Executive Summary
A scoped security audit of authentication, JWT signing, user registration/approval, and centralized Admin OAuth 2.0 credential segregation was conducted.

- **Empirical Suite Baseline** (re-verified on 2026-11-26):
  - `npm run build --prefix backend` (`tsc`): **PASS (0 errors)**
  - `npm test --prefix backend -- --run` (`vitest`): **PASS (45 test files, 371 tests passed)**
  - `npm run build --prefix frontend` (`vite build`): **PASS (11.58s, 2,186 modules transformed)**
- **Findings Summary**: **All 3 findings RESOLVED & SIGNED OFF** (0 CRITICAL / 0 HIGH / 0 MEDIUM / 0 LOW remaining).

---

## 3. Previous Audit & Sign-Off Review
- Correlated against [`agent-handoffs/audit/master-audit.md`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/agent-handoffs/audit/master-audit.md). Fully signed off under [`SIGN-OFF-AUTH-OAUTH-2026-11-26.md`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/agent-handoffs/audit/sign-off/SIGN-OFF-AUTH-OAUTH-2026-11-26.md).

---

## 4. Files & Modules Examined
- [`backend/src/middleware/auth.ts`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/middleware/auth.ts)
- [`backend/src/utils/auth.ts`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/utils/auth.ts)
- [`backend/src/routes/auth.ts`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/routes/auth.ts)
- [`backend/src/routes/messages.ts`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/routes/messages.ts#L748-L870)
- [`backend/src/services/messaging/oauth2Service.ts`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/services/messaging/oauth2Service.ts)

---

## 5. Findings Summary Table

| Finding ID | Severity | Status | Category | Location | Summary |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `AUD-AUTH-001` | `CRITICAL` | `RESOLVED` | Authentication / Privilege Escalation | `auth.ts:130-159,187-208` | Unauthenticated `GET /users`, broken `requireAuth` order on `/approve`, self-assignable `admin` role on `/register` (Resolved via route auth guards, auto-auth `requireRole`, and strict role restrictions on register/login) |
| `AUD-AUTH-002` | `CRITICAL` | `RESOLVED` | Cryptographic Rigor | `utils/auth.ts:3,40-41` | Hardcoded fallback `JWT_SECRET` in source and plaintext password comparison fallback (Resolved via `getJwtSecret` production enforcement and plaintext comparison prohibition in production) |
| `AUD-AUTH-003` | `HIGH` | `RESOLVED` | Credential Exposure / OAuth2 AuthZ (`Rule 14`) | `auth.ts:96,157,178`; `messages.ts:748-805` | `password_hash` returned in auth responses; `/admin/oauth2` routes lack `requireRole('admin')` (Resolved via `sanitizeUser` and `requireAuth, requireRole('admin')` on `/admin/oauth2`) |

---

## 6. Detailed Findings

### `AUD-AUTH-001` — Unauthenticated `GET /api/auth/users`, Broken `/approve` Middleware, & Self-Assignable `admin` Role
- **Severity**: `CRITICAL` | **Status**: `RESOLVED` | **Category**: Authentication & Privilege Escalation
- **File & Line**: [`auth.ts#L130-L159`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/routes/auth.ts#L130-L159), [`L187-L208`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/routes/auth.ts#L187-L208)
- **Resolution**:
  - Attached `requireAuth` to `GET /users`, `PUT /users/:id/profile`, and `PUT /users/:id/workspace-sharing`.
  - Attached `requireAuth, requireRole('admin')` to `PUT /users/:id/approve`, `PUT /users/:id/role`, and `DELETE /users/:id`.
  - Made `requireRole` in `middleware/auth.ts` and `utils/auth.ts` auto-authenticating if `req.user` is unpopulated.
  - Restricted `POST /register` to reject `role: 'admin'` with HTTP 400.
  - Eliminated unapproved admin login bypass in `POST /login`.

### `AUD-AUTH-002` — Hardcoded Fallback `JWT_SECRET` & Plaintext Password Fallback
- **Severity**: `CRITICAL` | **Status**: `RESOLVED` | **Category**: Cryptographic Rigor
- **File & Line**: [`utils/auth.ts#L3`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/utils/auth.ts#L3), [`L40-L41`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/utils/auth.ts#L40-L41)
- **Resolution**:
  - Implemented `getJwtSecret()` which enforces a valid, unique `JWT_SECRET` (>= 32 chars) in production, throwing on missing or default fallbacks.
  - Prohibited plaintext password comparisons in `verifyPassword` when running in production mode.
  - Added safe timing buffer comparison preventing length exceptions.

### `AUD-AUTH-003` — `password_hash` Leak & Missing Admin Role Gate on `/api/messages/admin/oauth2`
- **Severity**: `HIGH` | **Status**: `RESOLVED` | **Category**: Credential Exposure / Rule 14
- **File & Line**: [`auth.ts#L96`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/routes/auth.ts#L96), [`messages.ts#L748-L805`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/routes/messages.ts#L748-L805)
- **Resolution**:
  - Implemented `sanitizeUser()` in `routes/auth.ts` to strip `password_hash` on all user serialization endpoints.
  - Protected `GET`, `POST`, and `DELETE /api/messages/admin/oauth2` with `requireAuth, requireRole('admin')`.
  - Protected `GET /api/messages/admin/oauth2/available` with `requireAuth`. Derived `createdBy` from authenticated caller identity.

---

## 7. Positive Observations
- **PBKDF2 + `timingSafeEqual`**: `utils/auth.ts:20-37` uses salted PBKDF2-SHA512 (10,000 iterations) and `crypto.timingSafeEqual` for hashed passwords.
- **OAuth 2.0 Secret Masking**: `messages.ts:756,804-808,852` masks `clientSecret` as `'••••••••'` in `/admin/oauth2` responses and preserves existing secrets on edit.

---

## 8. Recommendations & Remediation Plan
1. **P0 (Critical)**: Secure `auth.ts` routes (`AUD-AUTH-001`) and remove hardcoded `JWT_SECRET` / plaintext fallback (`AUD-AUTH-002`).
2. **P1 (High)**: Sanitize `password_hash` from user payloads and gate `/admin/oauth2` with `requireRole('admin')` (`AUD-AUTH-003`).

**Recommended Next Action**: Run `/sign-off` to remediate open findings across the master audit register.
