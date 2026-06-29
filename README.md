# MITAKE Taiwan Asset Value

MITAKE is a small web app for estimating Taiwan stock portfolio asset value using Yahoo Finance chart data.

## Run locally

```bash
npm install
npm run dev:local
```

Open `http://127.0.0.1:8787`.

## Deploy

This repo includes a Cloudflare Workers configuration and a GitHub Actions workflow. Add these repository secrets before deploying from GitHub Actions:

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

## Data source

Prices come from Yahoo Finance chart endpoints. Taiwan listed stocks use `.TW`; OTC stocks use `.TWO`.
