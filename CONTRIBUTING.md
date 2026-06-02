# Contributing

Thanks for your interest in Nano.Agent!

## Setup

```bash
git clone https://github.com/phucrhm15/bookanai.git
cd bookanai
cp .env.local.example .env.local
npm install
npm run dev
```

See [README.md](./README.md) and [DEPLOY.md](./DEPLOY.md) for Circle, Clerk, and operator wallet setup.

## Pull requests

1. Fork the repo and create a branch from `main`
2. Keep changes focused; match existing TypeScript/React style
3. Do not commit secrets or local database files (`data/`, `*.db`)
4. Open a PR with a clear description and test steps

## Operator vs user wallets

When changing payment flows, document whether the change affects:

- **User** embedded wallet / Content Credits (SQLite ledger)
- **Operator** master wallet (`MASTER_AGENT_PRIVATE_KEY`) / Circle Gateway per chain (Base, Polygon)
