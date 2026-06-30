# Agent Integrations

This directory is the boundary for coding-agent specific packaging.

The web app exposes stable primitives that every integration should reuse:

- Authorized `POST /api/call-session` creates a magic-link voice session.
- Authorized `GET|POST /mcp` exposes the protected call MCP server.
- Browser magic links claim sessions into an HttpOnly cookie.

Each integration should own only the agent-specific installation and invocation
surface. It should not fork the session API, storage model, or voice UI.

## Implemented

- `codex/` installs a Codex plugin with a `this-needs-a-call` skill and `call`
  MCP server.

## Reserved

- `claude/`
- `cursor/`
- `opencode/`

Future adapters should follow the same shape:

- `README.md` with install/use instructions.
- An installer or manifest generator if that agent supports local extensions.
- A prompt/skill/command file that calls `POST /api/call-session` with the
  deployment bearer secret.
- MCP configuration pointed at the user's own deployed `/mcp` endpoint.
