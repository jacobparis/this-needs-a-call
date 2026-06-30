# Codex Integration

The committed Codex plugin lives at `plugins/this-needs-a-call`, with a repo
marketplace at `.agents/plugins/marketplace.json`. That package bundles the
skill and MCP server shape without real deployment credentials.

The local installer creates a configured Codex plugin pointed at the user's own
app URL. The URL can be local development or a hosted Vercel deployment.

```bash
vercel env run -- npm run install:codex-plugin -- \
  --app-url http://localhost:3000
```

For non-Vercel environments, pass the secret explicitly:

```bash
npm run install:codex-plugin -- \
  --app-url http://localhost:3000 \
  --mcp-secret "$MCP_SHARED_SECRET"
```

Equivalent direct command:

```bash
node integrations/codex/install.mjs \
  --app-url http://localhost:3000 \
  --mcp-secret "$MCP_SHARED_SECRET"
```

The generated plugin contains:

- `this-needs-a-call` skill
- `this-needs-a-call-poll` skill
- `call` HTTP MCP server
- personal marketplace entry
- the app URL as the `call` MCP server URL
- the same `MCP_SHARED_SECRET` bearer value used by the app

It also contains the bearer secret used for `/mcp` and session
creation. Keep the generated plugin local and private.

For local development, link the project, pull Vercel env, and run through
Vercel so OIDC-backed realtime access is available locally:

```bash
vercel link
export MCP_SHARED_SECRET="$(openssl rand -hex 32)"
vercel env add MCP_SHARED_SECRET development --value "$MCP_SHARED_SECRET" --yes --force
vercel env add MCP_SHARED_SECRET production --value "$MCP_SHARED_SECRET" --yes --force
vercel env pull
vercel env run -- npm run dev:vercel
```

Then install the plugin against the local dev server URL:

```bash
vercel env run -- npm run install:codex-plugin -- \
  --app-url http://localhost:3000
```

If `vercel dev` chooses a different port, use the printed local URL.

For hosted multi-device use, connect Upstash Redis, set the shared secret, and
deploy:

```bash
vercel integration add upstash/upstash-kv
DEPLOYMENT_URL="$(vercel deploy --prod --yes)"
vercel env run -e production -- npm run install:codex-plugin -- \
  --app-url "$DEPLOYMENT_URL"
```

Keep Codex-specific prompt wording here. Shared call/session behavior belongs in
the app routes and `app/lib/*`.
