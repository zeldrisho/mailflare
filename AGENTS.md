# Agent Instructions

## Toolchain

- Install dependencies with `vp install`; keep the pnpm lockfile.
- Run `package.json` scripts with `vp run <name>` rather than the similarly named built-ins; development/build/preview scripts bundle migrations first.
- Run the project-local Cloudflare CLI as `vp exec cf`; do not assume `cf` is installed globally. Migrate from Wrangler when `cf` supports the workflow, and keep Wrangler only for operations it still does not support.

## Commands

| Task                            | Command                                                |
| ------------------------------- | ------------------------------------------------------ |
| Workers development             | `vp run dev`                                           |
| Node development                | `vp run dev:node`                                      |
| Check changed files             | `vp check <paths>`                                     |
| Test one file                   | `vp run test -- tests/<name>.test.mjs`                 |
| Repository checks / tests       | `vp check` / `vp run test`                             |
| Explicit type check             | `vp exec tsc --noEmit`                                 |
| Worker build / preview / deploy | `vp run build` / `vp run preview` / `vp run deploy`    |
| Node build / start              | `vp run build:node` / `vp run start:node`              |
| Generate / bundle migrations    | `vp run db:generate` / `vp run db:bundle`              |
| Apply local / remote migrations | `vp run db:migrate:local` / `vp run db:migrate:remote` |
| Regenerate binding types        | `vp run cf-typegen`                                    |

## Key Conventions

- Read the relevant guide in `node_modules/next/dist/docs/` before changing framework code; this Next.js version has breaking changes.
- Tests use Vitest via `vite-plus/test`; Workers-binding integration checks belong in `scripts/` against the running development server.
- Do not rely on builds to catch type errors; run the explicit type check.
- Access bindings through `getEnv()` / `getEnvAsync()` in `src/lib/cloudflare.ts`, then `getDb(env)` from `src/db`; keep application logic shared across Workers and Node.
- Access blobs through wrapped `env.BUCKET` (`src/lib/storage/index.ts`), not directly through `cloudflare:workers` env.
- Preserve `worker.ts` platform handlers and its `RealtimeHub` export; inbound email stores MIME and queues processing instead of parsing inline.
- Keep the Worker name, `CF_EMAIL_WORKER_NAME`, and `WORKER_SELF_REFERENCE` service name in `cloudflare.config.ts` identical.
- Put non-trivial types and pure helpers in sibling `*-types.d.ts` and `*-utils.ts` files.
- Regenerate Cloudflare binding types with `vp run cf-typegen`; never hand-edit generated types.
- Prefer `requireSessionUser` (`src/lib/api/auth.ts`) for session-authenticated routes; API keys require scope checks.
- Authorize messages by accessible mailbox IDs through `src/lib/mailboxes/access.ts`, not by `userId` alone.
- Set routing-rule `scope` explicitly; preserve domain routing order: rejects, exact mailboxes/aliases, then catch-all fallbacks (`src/lib/email/routing.ts`).
- Keep webhook retries on `OUTBOUND_QUEUE` and preserve payload discriminators (`worker-utils.ts`, `src/lib/email/webhooks.ts`).
- Sending and receiving providers are independent; switching providers must not change DNS. Preserve single-MX-owner conflict checks (`src/lib/email/receiving-dns.ts`).
- Send through provider resolution (`src/lib/email/outbound-provider.ts`) and store the provider's reply-visible Message-ID.
- Use `splitEmailAddressList` (`src/lib/email/address.ts`) for multi-recipient fields and preserve reply/thread metadata (`src/lib/email/threading.ts`).
- Expand `threadMessageIds` for conversation actions; forwarding must copy attachments onto the draft before sending.
- Reject unsupported JMAP filters rather than silently dropping them (`src/lib/jmap/`); create/import messages into Drafts only and preserve imported raw MIME.
- Password resets use hashed, expiring, single-use tokens; password changes/resets revoke sessions, and MFA requires verification before enabling (`src/lib/auth/`).
- System mail must not create Sent messages or dispatch webhooks (`src/lib/email/system-mail.ts`).
- Gate custom branding with `getLicenseEntitlements` (`src/lib/licenses/`); self-update deployment and database migrations remain separate operations.
- Maintain schema history in `drizzle/migrations/` alongside `src/db/schema/index.ts`; `/setup` must refuse non-empty databases.
- For persisted table creation/rename/removal, update `BACKUP_TABLES` and `INTERNAL_TABLES` in `src/lib/backups/export.ts`, `BACKUP_TABLE_GROUPS` in `src/lib/backups/table-groups.ts`, and `DatabaseBackupTable` in `src/lib/backups/types.d.ts` in the same change.
- Put each backed-up table in exactly one group and keep foreign-key dependency order; document derived/internally managed exclusions.
- Test backup/restore before and after new-table migrations and keep older full backup documents restorable.
- Keep `messages_fts` trigger-managed and excluded from backups; preserve SQL trigger bodies with `splitSqlStatements`.

## External References

| Need                             | File                                                             |
| -------------------------------- | ---------------------------------------------------------------- |
| Setup and deployment             | `README.md`, `docs/deployment.md`, `cloudflare.config.ts`        |
| Node.js runtime                  | `docs/self-hosting.md`, `server/runtime/env.ts`                  |
| Providers and DNS                | `docs/providers.md`                                              |
| API and integrations             | `docs/api.md`, `docs/email-assistant-and-mcp.md`                 |
| Localization and spam protection | `docs/localization.md`, `docs/spam-protection.md`                |
| Troubleshooting and updates      | `docs/troubleshooting.md`, `.github/workflows/deploy-update.yml` |
| License                          | `LICENSE`                                                        |
