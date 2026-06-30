# This Needs A Call

Self-host a realtime voice-call companion for coding agents. The web app creates
magic-link call sessions, stores call state in Upstash/Vercel KV in production,
and exposes a protected MCP endpoint that agents can poll as an alternate input
stream. Codex is the first supported integration; Claude, Cursor, OpenCode, and
others should live under `integrations/` as separate adapters.

## Setup

Start from a local clone. The same checkout supports local development and
hosted multi-device use:

```bash
git clone https://github.com/jacobparis/this-needs-a-call
cd this-needs-a-call
npm install
vercel link
export MCP_SHARED_SECRET="$(openssl rand -hex 32)"
vercel env add MCP_SHARED_SECRET development --value "$MCP_SHARED_SECRET" --yes --force
vercel env add MCP_SHARED_SECRET production --value "$MCP_SHARED_SECRET" --yes --force
```

### Local Development

Pull the Vercel development environment, including the OIDC token needed for AI
Gateway realtime access, then run the app locally:

```bash
vercel env pull
vercel env run -- npm run dev:vercel
```

In another terminal, install the Codex plugin against the local dev URL. If
`vercel dev` prints a different port, use that URL instead:

```bash
vercel env run -- npm run install:codex-plugin -- \
  --app-url http://localhost:3000
```

The generated plugin uses `http://localhost:3000/mcp` as the `call` MCP server
and the same bearer secret that the local server receives in
`MCP_SHARED_SECRET`.

### Hosted Multi-Device Use

For calls that need to move across devices, connect durable storage and deploy
to production:

```bash
vercel integration add upstash/upstash-kv
DEPLOYMENT_URL="$(vercel deploy --prod --yes)"
vercel env run -e production -- npm run install:codex-plugin -- \
  --app-url "$DEPLOYMENT_URL"
```

`MCP_SHARED_SECRET` protects both the `/mcp` endpoint and session creation by
default. Set `CALL_SESSION_CREATE_SECRET` only if you want a separate bearer
token for creating magic links.

`UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` also work instead of the
`KV_*` names.

The app uses Vercel OIDC for AI Gateway realtime access, so no AI Gateway API
key is required when deployed on Vercel or when run through Vercel dev with the
pulled development environment.

## Install The Codex Plugin

This repo ships a Codex plugin bundle at `plugins/this-needs-a-call` and a repo
marketplace at `.agents/plugins/marketplace.json`. The committed plugin is safe
to publish because it only contains example MCP values.

Each user should install a configured local copy pointed at their own app URL.
If you did not keep the deployment URL from the hosted setup step, capture it
from a production deploy:

```bash
DEPLOYMENT_URL="$(vercel deploy --prod --yes)"
vercel env run -e production -- npm run install:codex-plugin -- \
  --app-url "$DEPLOYMENT_URL"
```

The installer can also receive the secret explicitly, which is useful for
non-Vercel environments:

```bash
npm run install:codex-plugin -- \
  --app-url https://your-project.vercel.app \
  --mcp-secret "$MCP_SHARED_SECRET"
```

The installer writes:

- a local plugin at `~/.agents/plugins/plugins/this-needs-a-call`
- a marketplace entry in `~/.agents/plugins/marketplace.json`
- a `this-needs-a-call` skill
- a `this-needs-a-call-poll` skill for the scheduled heartbeat
- a `call` HTTP MCP server pointed at `<app-url>/mcp`
- an `Authorization: Bearer $MCP_SHARED_SECRET` header matching the deployed app

The generated plugin contains bearer credentials for your deployment. Treat it
like local secret config: do not commit it, publish it, or share it with another
user unless you intend to grant access to your call app.

Restart Codex after installing or reload plugins if your Codex build exposes a
plugin reload action.

For marketplace-based distribution, add the repository as a Codex plugin
marketplace:

```bash
codex plugin marketplace add jacobparis/this-needs-a-call --ref main
```

Then install `this-needs-a-call` from that marketplace. The direct marketplace
plugin still needs deployment-specific MCP URL and bearer configuration before
it can connect to a real app, so the local `npm run install:codex-plugin`
installer is the default path for end users.

## Agent Integrations

Agent-specific packaging lives in `integrations/`.

- `integrations/codex` is implemented.
- `integrations/claude`, `integrations/cursor`, and `integrations/opencode` are
  reserved for future adapters.

Each adapter should reuse the same deployed app, `/api/call-session`, and `/mcp`
server. `POST /api/call-session` and `/mcp` both require bearer authorization in
production; a deployed URL by itself is not enough to create sessions or connect
an MCP client. Do not duplicate the session API per agent.

## Use

In Codex, invoke:

```text
/this-needs-a-call
```

The skill creates a magic-link session at your deployed app, starts the monitor,
and gives you a browser URL at `/sessions/<sessionId>`. The browser claims the
session into an HttpOnly cookie. A different browser cannot read the session
unless you explicitly share the in-page magic link or QR code.

Magic links are bearer credentials for a single browser session. Anyone with a
magic link can claim that session, which is what enables moving a call to a
phone. Share them only with devices you trust.

To force memory storage:

```bash
CALL_STORAGE_ADAPTER=memory npm run dev
```

Production fails closed if durable storage is not configured.
