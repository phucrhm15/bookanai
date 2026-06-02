# Security Policy

## Supported versions

| Version | Supported |
| ------- | --------- |
| `main`  | Yes       |

## Reporting a vulnerability

Please **do not** open a public GitHub issue for security-sensitive reports.

Email or DM the repository maintainer with:

- Description of the issue
- Steps to reproduce
- Impact (e.g. key leakage, unauthorized wallet access)

We will respond as soon as possible.

## Secrets

Never commit:

- `.env.local`, `.env`, `.dev.vars`
- `MASTER_AGENT_PRIVATE_KEY`, `ENTITY_SECRET`, `CLERK_SECRET_KEY`, `CIRCLE_API_KEY`
- `circle-entity-recovery.dat`

Rotate any key that was accidentally pushed and force-remove it from git history if needed.

## Operator endpoints

These routes require `Authorization: Bearer <SETTLEMENT_CRON_SECRET>` in production:

- `GET /api/debug/x402`
- `GET /api/master/status`
- `POST /api/cron/settle-batch`

Do not expose `SETTLEMENT_CRON_SECRET` in client-side code.
