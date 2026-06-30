# Codex Integration

The installer writes a local Codex plugin configured for one app URL and one
`MCP_SHARED_SECRET`.

Local development:

```bash
vercel env pull
vercel env run -- npm run install:codex-plugin -- \
  --app-url https://this-needs-a-call.localhost
```

Hosted deployment:

```bash
vercel env run -e production -- npm run install:codex-plugin -- \
  --app-url "$DEPLOYMENT_URL"
```

The generated plugin contains bearer credentials. Keep it local and private.
