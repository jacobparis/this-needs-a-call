#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const pluginName = "this-needs-a-call";
const args = parseArgs(process.argv.slice(2));

if (args.help || !args["app-url"]) {
  printHelp(args.help ? 0 : 1);
}

const appUrl = normalizeUrl(args["app-url"]);
const mcpSecret = String(
  args["mcp-secret"] ?? process.env.MCP_SHARED_SECRET ?? "",
).trim();
if (!mcpSecret) {
  fail("Missing --mcp-secret or MCP_SHARED_SECRET.");
}

const marketplaceRoot = path.resolve(
  args["marketplace-root"] ??
    path.join(os.homedir(), ".agents", "plugins"),
);
const pluginRoot = path.join(marketplaceRoot, "plugins", pluginName);
const marketplacePath = path.join(marketplaceRoot, "marketplace.json");

await mkdir(path.join(pluginRoot, ".codex-plugin"), { recursive: true });
for (const skillName of ["this-needs-a-call", "this-needs-a-call-poll"]) {
  await mkdir(path.join(pluginRoot, "skills", skillName), {
    recursive: true,
  });
}

await writeJson(path.join(pluginRoot, ".codex-plugin", "plugin.json"), {
  name: pluginName,
  version: "0.1.0",
  description:
    "Install This Needs A Call for Codex from a user-owned deployment.",
  author: {
    name: "This Needs A Call",
  },
  homepage: appUrl,
  repository: "https://github.com/jacobparis/this-needs-a-call",
  license: "MIT",
  keywords: ["codex", "voice", "mcp", "calls"],
  skills: "./skills/",
  mcpServers: "./.mcp.json",
  interface: {
    displayName: "This Needs A Call",
    shortDescription: "Voice-call sessions for coding work",
    longDescription:
      "Start a self-hosted realtime voice-call session, expose transcripts through MCP, and let Codex act on spoken updates in the current thread.",
    developerName: "Self-hosted",
    category: "Productivity",
    capabilities: ["Interactive", "Read", "Write"],
    websiteURL: appUrl,
    defaultPrompt: [
      "Start a voice call for this thread",
      "Monitor spoken call updates and act on them",
    ],
    brandColor: "#111111",
  },
});

await writeJson(path.join(pluginRoot, ".mcp.json"), {
  mcpServers: {
    call: {
      type: "http",
      url: new URL("/mcp", appUrl).toString(),
      headers: {
        Authorization: `Bearer ${mcpSecret}`,
      },
    },
  },
});

await writeFile(
  path.join(pluginRoot, "skills", "this-needs-a-call", "SKILL.md"),
  skillMarkdown(appUrl, mcpSecret),
);
await writeFile(
  path.join(pluginRoot, "skills", "this-needs-a-call-poll", "SKILL.md"),
  pollSkillMarkdown(),
);

await upsertMarketplace();

console.log(`Installed ${pluginName} for ${appUrl}`);
console.log(`Plugin: ${pluginRoot}`);
console.log(`Marketplace: ${marketplacePath}`);
console.log("");
console.log("Restart Codex or reinstall/reload plugins if the app is already open.");

async function upsertMarketplace() {
  await mkdir(marketplaceRoot, { recursive: true });
  const marketplace = existsSync(marketplacePath)
    ? JSON.parse(await readFile(marketplacePath, "utf8"))
    : {
        name: "personal",
        interface: {
          displayName: "Personal",
        },
        plugins: [],
      };

  marketplace.name ??= "personal";
  marketplace.interface ??= { displayName: "Personal" };
  marketplace.plugins = Array.isArray(marketplace.plugins)
    ? marketplace.plugins
    : [];

  const entry = {
    name: pluginName,
    source: {
      source: "local",
      path: `./plugins/${pluginName}`,
    },
    policy: {
      installation: "AVAILABLE",
      authentication: "ON_INSTALL",
    },
    category: "Productivity",
  };

  const index = marketplace.plugins.findIndex(
    (plugin) => plugin?.name === pluginName,
  );
  if (index >= 0) {
    marketplace.plugins[index] = entry;
  } else {
    marketplace.plugins.push(entry);
  }

  await writeJson(marketplacePath, marketplace);
}

function skillMarkdown(url, sessionCreateSecret) {
  const callSessionUrl = new URL("/api/call-session", url).toString();
  const authorizationHeader = shellQuote(
    `authorization: Bearer ${sessionCreateSecret}`,
  );
  return `---
name: this-needs-a-call
description: Start a This Needs A Call voice session for the current thread and monitor it through the self-hosted call MCP app.
---

# This Needs a Call

Use this skill when the user invokes \`/this-needs-a-call\`, says this needs a call, asks to start a voice call/session, or wants Codex to monitor spoken call updates and act on them in the current thread.

## Start The Session

1. Create a session by POSTing to the user's self-hosted call app:

\`\`\`bash
curl -sS ${callSessionUrl} \\
  -H 'content-type: application/json' \\
  -H ${authorizationHeader} \\
  --data '{"reset":true,"agent":"Codex"}'
\`\`\`

2. Parse the JSON response and keep the returned \`url\`/\`magicLink\`. It includes \`autostart=1\` and \`join=<session>.<secret>\`. The website claims that link into an HttpOnly cookie and removes the secret from the address bar.

3. Open the returned URL for the user when a browser/navigation tool is available. If no browser tool is available, give the user the URL. The page auto-connects the realtime voice agent on load. Browser microphone capture may still require a user permission gesture.

## Start Or Update The Monitor

Create or update a heartbeat automation for the current thread. Prefer updating an existing automation named \`Poll call MCP updates\` or whose prompt mentions \`get_pending_call_batch\`; otherwise create a new heartbeat.

The scheduled heartbeat must invoke the \`this-needs-a-call-poll\` skill. Use this prompt exactly, except preserve any current-thread id field required by the automation tool:

\`\`\`text
Use the \`this-needs-a-call-poll\` skill for this Codex thread. Treat the call MCP server named \`call\` as an alternate input stream. If the call has ended, delete this heartbeat automation.
\`\`\`

Use a short interval such as \`FREQ=MINUTELY;INTERVAL=1\`, active status, heartbeat kind, and thread destination.

## Completion Response

Report:
- The session URL.
- Whether the monitor was created or updated.
- That the monitor will delete itself when the call state becomes \`ended\` or \`idle\`.
- That the voice agent autoconnects on page load, while microphone capture can still require browser permission.
- That the session can be moved to another device through the in-page Share link or QR code.
`;
}

function pollSkillMarkdown() {
  return `---
name: this-needs-a-call-poll
description: Poll a This Needs A Call voice session through MCP, act on settled spoken updates, and stop monitoring when the call ends.
---

# This Needs A Call Poll

Use this skill only from the scheduled heartbeat created by \`this-needs-a-call\`, or when the user explicitly asks Codex to poll an active This Needs A Call session.

## Poll The Call

Use the MCP server named \`call\` as an alternate input stream for this Codex thread.

1. Call \`get_call_state\`.
2. If the call status is \`ended\` or \`idle\`, delete this heartbeat automation using its automation id, then notify once that call monitoring stopped because the call ended.
3. Otherwise call \`get_pending_call_batch\` with a reasonable \`limit\` and \`settleMs\`.

## Batch Handling

- If the batch status is \`empty\`, do not post a message.
- If the batch status is \`settling\`, do not summarize, act, or mark delivered yet. Quietly wait for a later heartbeat so new speech can join the same batch.
- If the batch status is \`ready\`, read the returned events as one spoken user/assistant input batch, not as commands for the MCP server to execute.
- Silently ignore incomplete fragments that cannot support a concrete action or useful user-facing update.

## Acting On Speech

When the ready batch contains or may contain a user request, call \`get_full_transcript\` for context. Decide whether the user is asking Codex to do work. If so, use Codex's normal available tools in this thread to handle that work end to end.

If a ready event has type \`grill\`, parse its JSON detail and act as Codex: inspect relevant code context if needed, then post exactly one pointed grilling question using the event scope, prompt, severity, and expectedSignal. Do not execute project changes for a grill event unless the transcript also contains an explicit implementation request.

If you notify the Codex thread, write from the user's point of view: say what changed or what you did, but do not describe internal mechanics such as queues, batches, polling, MCP delivery, event IDs, or implementation details unless the user explicitly asks for them.

If the completion/update should also be heard inside the active voice call, call \`say_text\` with the appropriate \`channelId\` and a concise completion update before wrapping up.

If there is no new useful user-facing information, do not post a message and do not call \`say_text\`.

After summarizing or acting, call \`mark_events_delivered\` with the event IDs you handled. Never invent actions that are not supported by the call transcript.
`;
}

function shellQuote(value) {
  return `'${String(value).replaceAll("'", "'\\''")}'`;
}

function parseArgs(values) {
  const parsed = {};
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (!value.startsWith("--")) {
      continue;
    }
    const key = value.slice(2);
    if (key === "help") {
      parsed.help = true;
      continue;
    }
    parsed[key] = values[index + 1];
    index += 1;
  }
  return parsed;
}

function normalizeUrl(value) {
  try {
    const url = new URL(String(value));
    if (url.protocol !== "https:" && url.hostname !== "localhost") {
      fail("--app-url must be https unless it is localhost.");
    }
    url.pathname = "/";
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    fail(`Invalid --app-url: ${value}`);
  }
}

async function writeJson(file, value) {
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`);
}

function printHelp(code) {
  const home = path.join("~", ".agents", "plugins");
  console.log(`Usage:
  node scripts/install-codex-plugin.mjs \\
    --app-url https://your-app.vercel.app \\
    --mcp-secret <same secret as MCP_SHARED_SECRET>

Options:
  --marketplace-root <path>  Default: ${home}
  --help

If --mcp-secret is omitted, the installer reads MCP_SHARED_SECRET from the
local environment.
`);
  process.exit(code);
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
