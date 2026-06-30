# This Needs A Call

Self-host a voice call for your coding agent. Start a session from Codex, talk
through an idea from your desk or phone, and let the Codex thread read the
settled transcript in the background.

Requires Node.js 24+ for stable local URLs through Portless.

## 1. Clone and Link

```bash
git clone https://github.com/jacobparis/this-needs-a-call
cd this-needs-a-call
npm install
vercel link
DEV_MCP_SHARED_SECRET="$(openssl rand -hex 32)"
vercel env add MCP_SHARED_SECRET development --value "$DEV_MCP_SHARED_SECRET" --yes --force
```

## 2. Install the Local Plugin

```bash
vercel env pull
vercel env run -- npm run install:codex-plugin -- \
  --app-url https://this-needs-a-call.localhost
```

## 3. Run Locally

```bash
vercel env run -- npm run dev:portless
```

Portless gives local development the same stable URL every time:
`https://this-needs-a-call.localhost`.

## 4. Deploy for Phone Handoff

Use a separate production secret. Do not reuse the development secret.

```bash
vercel integration add upstash/upstash-kv
PROD_MCP_SHARED_SECRET="$(openssl rand -hex 32)"
vercel env add MCP_SHARED_SECRET production --value "$PROD_MCP_SHARED_SECRET" --yes --force
DEPLOYMENT_URL="$(vercel deploy --prod --yes)"
vercel env run -e production -- npm run install:codex-plugin -- \
  --app-url "$DEPLOYMENT_URL"
```

The Upstash marketplace product is Redis-compatible storage. Production fails
closed without `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`.

## 5. Start a Call

In Codex:

```text
/this-needs-a-call
```

The skill creates a session URL at `/sessions/<sessionId>`, starts the monitor,
and opens a voice call page. Use the in-page Share link or QR code to move the
same session to another device.

## Security

`MCP_SHARED_SECRET` protects session creation and the `/mcp` endpoint. Magic
links are bearer credentials for a single call session: anyone with the link can
claim that session, which is what enables phone handoff. Share them only with
devices you trust.
