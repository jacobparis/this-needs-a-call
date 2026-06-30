---
name: this-needs-a-call-poll
description: Poll a This Needs A Call voice session through MCP, act on settled spoken updates, and stop monitoring when the call ends.
---

# This Needs A Call Poll

Use this skill only from the scheduled heartbeat created by `this-needs-a-call`, or when the user explicitly asks Codex to poll an active This Needs A Call session.

## Poll The Call

Use the MCP server named `call` as an alternate input stream for this Codex thread.

1. Call `get_call_state`.
2. If the call status is `ended` or `idle`, delete this heartbeat automation using its automation id, then notify once that call monitoring stopped because the call ended.
3. Otherwise call `get_pending_call_batch` with a reasonable `limit` and `settleMs`.

## Batch Handling

- If the batch status is `empty`, do not post a message.
- If the batch status is `settling`, do not summarize, act, or mark delivered yet. Quietly wait for a later heartbeat so new speech can join the same batch.
- If the batch status is `ready`, read the returned events as one spoken user/assistant input batch, not as commands for the MCP server to execute.
- Silently ignore incomplete fragments that cannot support a concrete action or useful user-facing update.

## Acting On Speech

When the ready batch contains or may contain a user request, call `get_full_transcript` for context. Decide whether the user is asking Codex to do work. If so, use Codex's normal available tools in this thread to handle that work end to end.

If a ready event has type `grill`, parse its JSON detail and act as Codex: inspect relevant code context if needed, then post exactly one pointed grilling question using the event scope, prompt, severity, and expectedSignal. Do not execute project changes for a grill event unless the transcript also contains an explicit implementation request.

If you notify the Codex thread, write from the user's point of view: say what changed or what you did, but do not describe internal mechanics such as queues, batches, polling, MCP delivery, event IDs, or implementation details unless the user explicitly asks for them.

If the completion/update should also be heard inside the active voice call, call `say_text` with the appropriate `channelId` and a concise completion update before wrapping up.

If there is no new useful user-facing information, do not post a message and do not call `say_text`.

After summarizing or acting, call `mark_events_delivered` with the event IDs you handled. Never invent actions that are not supported by the call transcript.
