# Audit Report: Auth Middleware, JWT & OAuth 2.0 Segregation (`AUD-AUTH-OAUTH-2026-11-24`)

## 1. Audit Metadata & Scope
- **Audit ID**: `AUD-AUTH-OAUTH-2026-11-24`
- **Audit Date**: 2026-11-24 22:53 (UTC+3)
- **Target Scope**: Authentication Middleware (`middleware/auth.ts`), JWT & Password Crypto (`utils/auth.ts`), Auth Router (`routes/auth.ts`), and Admin OAuth 2.0 Routes (`routes/messages.ts` & `oauth2Service.ts`)
- **Branch**: `feature/frontend-redesign`
- **Commit**: `d7bf228`
- **Governing Standards**: [`AGENTS.md`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/AGENTS.md) (Rule 14) & [`code-audit`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/.agents/skills/code-audit/SKILL.md)
- **Audit Mode**: Read-only code & empirical verification audit (zero application source edits)

---

## 2. Executive Summary
A scoped security audit of authentication, JWT signing, user registration/approval, and centralized Admin OAuth 2.0 credential segregation was conducted.

- **Empirical Suite Baseline** (verified at HEAD `d7bf228`):
  - `npm run build --prefix backend` (`tsc`): **PASS**
  - `npm test --prefix backend -- --run` (`vitest`): **PASS** (**39 test files, 312 tests passed**)
  - `npm run build --prefix frontend` (`vite build`): **PASS**
- **Findings Summary**: **3 findings** identified (**2 CRITICAL**, **1 HIGH**, **0 MEDIUM**, **0 LOW**).

---

## 3. Previous Audit & Sign-Off Review
- Correlated against [`agent-handoffs/audit/master-audit.md`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/agent-handoffs/audit/master-audit.md). Prior 4 audits remain `OPEN`.

---

## 4. Files & Modules Examined
- [`backend/src/middleware/auth.ts`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/middleware/auth.ts)
- [`backend/src/utils/auth.ts`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/utils/auth.ts)
- [`backend/src/routes/auth.ts`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/routes/auth.ts)
- [`backend/src/routes/messages.ts`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/routes/messages.ts#L748-L854)
- [`backend/src/services/messaging/oauth2Service.ts`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/services/messaging/oauth2Service.ts)

---

## 5. Findings Summary Table

| Finding ID | Severity | Status | Category | Location | Summary |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `AUD-AUTH-001` | `CRITICAL` | `OPEN` | Authentication / Privilege Escalation | `auth.ts:130-159,187-208` | Unauthenticated `GET /users`, broken `requireAuth` order on `/approve`, self-assignable `admin` role on `/register` |
| `AUD-AUTH-002` | `CRITICAL` | `OPEN` | Cryptographic Rigor | `utils/auth.ts:3,40-41` | Hardcoded fallback `JWT_SECRET` in source and plaintext password comparison fallback |
| `AUD-AUTH-003` | `HIGH` | `OPEN` | Credential Exposure / OAuth2 AuthZ (`Rule 14`) | `auth.ts:96,157,178`; `messages.ts:748-805` | `password_hash` returned in auth responses; `/admin/oauth2` routes lack `requireRole('admin')` |

---

## 6. Detailed Findings

### `AUD-AUTH-001` — Unauthenticated `GET /api/auth/users`, Broken `/approve` Middleware, & Self-Assignable `admin` Role
- **Severity**: `CRITICAL` | **Status**: `OPEN` | **Category**: Authentication & Privilege Escalation
- **File & Line**: [`auth.ts#L130-L159`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/routes/auth.ts#L130-L159), [`L187-L208`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/routes/auth.ts#L187-L208)
- **Evidence**:
  - `GET /api/auth/users` (`L187`) is mounted under unauthenticated `/api/auth` with no `requireAuth` or `requireRole('admin')`.
  - `PUT /api/auth/users/:id/approve` (`L199`) attaches `requireRole('admin')` without `requireAuth`, so `req.user` is always `undefined` (HTTP 401).
  - `POST /api/auth/register` (`L134`) accepts `role: 'admin'` directly from `req.body` and issues a JWT containing `role: 'admin'`.
- **Recommended Remediation**: Add `requireAuth, requireRole('admin')` to `/users` and `/users/:id/approve`; disallow `'admin'` self-registration on `/register`.

### `AUD-AUTH-002` — Hardcoded Fallback `JWT_SECRET` & Plaintext Password Fallback
- **Severity**: `CRITICAL` | **Status**: `OPEN` | **Category**: Cryptographic Rigor
- **File & Line**: [`utils/auth.ts#L3`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/utils/auth.ts#L3), [`L40-L41`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/utils/auth.ts#L40-L41)
- **Evidence**: `JWT_SECRET` falls back to a committed literal string if `process.env.JWT_SECRET` is unset, and `verifyPassword` falls back to `password === storedHash` if `:` is absent.
- **Recommended Remediation**: Require `process.env.JWT_SECRET` in production (or generate an ephemeral CSPRNG secret in dev) and remove plaintext password comparison in production.

### `AUD-AUTH-003` — `password_hash` Leak & Missing Admin Role Gate on `/api/messages/admin/oauth2`
- **Severity**: `HIGH` | **Status**: `OPEN` | **Category**: Credential Exposure / Rule 14
- **File & Line**: [`auth.ts#L96`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/routes/auth.ts#L96), [`messages.ts#L748-L805`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/routes/messages.ts#L748-L805)
- **Evidence**: `/login`, `/register`, and `/me` serialize the raw `user` record (including `password_hash`); `GET` and `POST /api/messages/admin/oauth2` lack `requireRole('admin')`.
- **Recommended Remediation**: Strip `password_hash` from all user responses and enforce `requireRole('admin')` on `/admin/oauth2` endpoints.

---

## 7. Positive Observations
- **PBKDF2 + `timingSafeEqual`**: `utils/auth.ts:20-37` uses salted PBKDF2-SHA512 (10,000 iterations) and `crypto.timingSafeEqual` for hashed passwords.
- **OAuth 2.0 Secret Masking**: `messages.ts:756,804-808,852` masks `clientSecret` as `'••••••••'` in `/admin/oauth2` responses and preserves existing secrets on edit.

---

## 8. Recommendations & Remediation Plan
1. **P0 (Critical)**: Secure `auth.ts` routes (`AUD-AUTH-001`) and remove hardcoded `JWT_SECRET` / plaintext fallback (`AUD-AUTH-002`).
2. **P1 (High)**: Sanitize `password_hash` from user payloads and gate `/admin/oauth2` with `requireRole('admin')` (`AUD-AUTH-003`).

**Recommended Next Action**: Run `/sign-off` to remediate open findings across the master audit register.
