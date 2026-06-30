# This Needs A Call Codex Plugin

This plugin bundles the Codex-facing pieces for This Needs A Call:

- `this-needs-a-call` skill
- `this-needs-a-call-poll` skill for scheduled transcript polling
- `call` HTTP MCP server configuration
- install-surface metadata for the Codex plugin directory

The committed package is safe to publish because it does not contain a real
secret. Install it from the linked project clone so each user gets a private
configured copy pointed at their own app URL:

```bash
vercel env pull
vercel env run -- npm run install:codex-plugin -- \
  --app-url https://this-needs-a-call.localhost
```

The installer writes a local marketplace entry, installs or refreshes the Codex
plugin, and replaces the example MCP URL and bearer token with the user's app
values. The generated MCP server URL is always `<app URL>/mcp`, and its bearer
token must match the app's `MCP_SHARED_SECRET`.

For local development, generate and set `MCP_SHARED_SECRET` immediately after
`vercel link`, install the plugin against the stable Portless URL, then run the
app with `vercel env run -- npm run dev:portless`.
