---
name: this-needs-a-call
description: Start a This Needs A Call voice session for the current thread and monitor it through the self-hosted call MCP app.
---

# This Needs A Call

Use this skill when the user invokes `/this-needs-a-call`, says this needs a call, asks to start a voice call/session, or wants Codex to monitor spoken call updates and act on them in the current thread.

If this plugin is still configured with `https://example.com` or `replace-with-your-mcp-shared-secret`, stop and tell the user to run the installer from their deployment instructions. Do not call the example MCP server or create an example session.

## Start The Session

1. Create a session by POSTing to the user's self-hosted call app:

```bash
curl -sS https://example.com/api/call-session \
  -H 'content-type: application/json' \
  -H 'authorization: Bearer replace-with-your-mcp-shared-secret' \
  --data '{"reset":true,"agent":"Codex"}'
```

2. Parse the JSON response and keep the returned `url`/`magicLink`. It lands on `/sessions/<sessionId>` and includes `autostart=1` plus `join=<session>.<secret>`. The website claims that link into an HttpOnly cookie and removes the secret from the address bar.

3. Open the returned URL for the user when a browser/navigation tool is available. If no browser tool is available, give the user the URL. The page auto-connects the realtime voice agent on load. Browser microphone capture may still require a user permission gesture.

## Start Or Update The Monitor

Create or update a heartbeat automation for the current thread. Prefer updating an existing automation named `Poll call MCP updates` or whose prompt mentions `get_pending_call_batch`; otherwise create a new heartbeat.

The scheduled heartbeat must invoke the `this-needs-a-call-poll` skill. Use this prompt exactly, except preserve any current-thread id field required by the automation tool:

```text
Use the `this-needs-a-call-poll` skill for this Codex thread. Treat the call MCP server named `call` as an alternate input stream. If the call has ended, delete this heartbeat automation.
```

Use a short interval such as `FREQ=MINUTELY;INTERVAL=1`, active status, heartbeat kind, and thread destination.

## Completion Response

Report:

- The session URL.
- Whether the monitor was created or updated.
- That the monitor will delete itself when the call state becomes `ended` or `idle`.
- That the voice agent autoconnects on page load, while microphone capture can still require browser permission.
- That the session can be moved to another device through the in-page Share link or QR code.
