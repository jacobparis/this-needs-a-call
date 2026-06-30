import {
  addChannelMessage,
  addUtterance,
  endCall,
  getCallEvents,
  getChannelMessages,
  getPendingCallBatch,
  getCallState,
  getCallSummary,
  getFullTranscript,
  markEventsDelivered,
  markChannelMessages,
  resetCall,
  setMute,
  startCall,
} from "@/app/lib/calls";
import { withHydratedCallStore } from "@/app/lib/call-storage";
import { authorizeBearerSecret } from "@/app/lib/server-auth";

type JsonRpcRequest = {
  jsonrpc?: "2.0";
  id?: string | number | null;
  method?: string;
  params?: unknown;
};

type ToolCallParams = {
  name?: string;
  arguments?: Record<string, unknown>;
};

const tools = [
  {
    name: "start_call",
    description:
      "Start or reset the active voice-call transcript that a coding agent can monitor.",
    inputSchema: {
      type: "object",
      properties: {
        contact: { type: "string" },
        sessionId: { type: "string" },
        scenario: {
          type: "string",
          enum: ["intake", "incident", "review"],
        },
        openingLine: { type: "string" },
      },
    },
  },
  {
    name: "send_utterance",
    description: "Append a spoken utterance to the active call transcript.",
    inputSchema: {
      type: "object",
      properties: {
        role: { type: "string", enum: ["user", "assistant", "system"] },
        text: { type: "string" },
      },
      required: ["text"],
    },
  },
  {
    name: "get_call_state",
    description:
      "Read the current call status, transcript, and in-memory grillMe mode state.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "get_call_summary",
    description:
      "Get a concise summary of the current voice call. Treat this as alternate user input for the coding agent, not as an action executor.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "get_full_transcript",
    description:
      "Return the complete current call transcript. The `conversation` and `conversationText` fields contain user and assistant utterances combined in chronological order for the coding agent to act on spoken requests.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "get_new_call_events",
    description:
      "Poll unread voice-call events and transcript updates since the last delivery. Transcript events may include structured payload entries; treat those as authoritative voice input even if full call state is thinner.",
    inputSchema: {
      type: "object",
      properties: {
        includeDelivered: { type: "boolean" },
        limit: { type: "number" },
      },
    },
  },
  {
    name: "get_pending_call_batch",
    description:
      "Return unread voice-call events as a settled processing batch. If status is `settling`, the coding agent should wait and poll later instead of acting on a partial batch.",
    inputSchema: {
      type: "object",
      properties: {
        includeDelivered: { type: "boolean" },
        limit: { type: "number" },
        settleMs: { type: "number" },
      },
    },
  },
  {
    name: "mark_events_delivered",
    description:
      "Mark call events as delivered after the coding agent has read, summarized, or acted on them.",
    inputSchema: {
      type: "object",
      properties: {
        eventIds: {
          type: "array",
          items: { type: "string" },
        },
      },
    },
  },
  {
    name: "say_text",
    description:
      "Send a user-visible message to a voice channel. Active channels may speak it; inactive channels show it as unread.",
    inputSchema: {
      type: "object",
      properties: {
        channelId: { type: "string" },
        text: { type: "string" },
        priority: { type: "string", enum: ["low", "normal", "high"] },
      },
      required: ["text"],
    },
  },
  {
    name: "get_channel_messages",
    description: "Read pending or historical messages sent to voice channels.",
    inputSchema: {
      type: "object",
      properties: {
        includeRead: { type: "boolean" },
        channelId: { type: "string" },
        limit: { type: "number" },
      },
    },
  },
  {
    name: "mark_channel_messages",
    description: "Mark channel messages as read and spoken after the UI handles them.",
    inputSchema: {
      type: "object",
      properties: {
        messageIds: {
          type: "array",
          items: { type: "string" },
        },
      },
    },
  },
  {
    name: "set_mute",
    description: "Set whether the active voice session is muted.",
    inputSchema: {
      type: "object",
      properties: {
        muted: { type: "boolean" },
      },
      required: ["muted"],
    },
  },
  {
    name: "end_call",
    description: "End the current voice-call session.",
    inputSchema: {
      type: "object",
      properties: {
        summary: { type: "string" },
      },
    },
  },
  {
    name: "reset_call",
    description: "Reset the call workspace to its initial idle state.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
];

export async function GET(request: Request) {
  const auth = authorizeMcp(request);
  if (auth) {
    return auth;
  }

  return withHydratedCallStore(async () => Response.json({
    name: "this-needs-a-call",
    transport: "streamable-http-json-rpc",
    endpoint: "/mcp",
    tools: tools.map((tool) => tool.name),
  }));
}

export async function POST(request: Request) {
  const auth = authorizeMcp(request);
  if (auth) {
    return auth;
  }

  const payload = (await request.json().catch(() => null)) as
    | JsonRpcRequest
    | JsonRpcRequest[]
    | null;

  if (!payload) {
    return rpcError(null, -32700, "Parse error");
  }

  return withHydratedCallStore(
    async () => {
      if (Array.isArray(payload)) {
        const responses = (await Promise.all(payload.map(handleRequest))).filter(Boolean);
        return Response.json(responses);
      }

      const response = await handleRequest(payload);
      if (!response) {
        return new Response(null, { status: 202 });
      }

      return Response.json(response);
    },
    { persist: true },
  );
}

function authorizeMcp(request: Request): Response | null {
  return authorizeBearerSecret({
    request,
    secret: process.env.MCP_SHARED_SECRET,
    missingMessage: "MCP_SHARED_SECRET is required in production.",
  });
}

async function handleRequest(request: JsonRpcRequest) {
  const id = request.id ?? null;

  switch (request.method) {
    case "initialize":
      return {
        jsonrpc: "2.0",
        id,
        result: {
          protocolVersion: "2025-06-18",
          capabilities: {
            tools: {},
          },
          serverInfo: {
            name: "this-needs-a-call",
            version: "0.1.0",
          },
          instructions:
            "This MCP server is only an alternate input stream for a voice call. It does not execute project changes. Prefer get_pending_call_batch for unread voice updates. If its status is `settling`, do not summarize, act, or mark delivered yet; poll again later so new speech can join the same batch. If an event contains or implies a user request, call get_full_transcript for context when needed, then use the coding agent's normal tools outside this MCP server to handle the request. If an unread event has type `grill`, parse its JSON detail and follow the Grill Me contract: inspect relevant code context when it can answer facts, ask exactly one pointed question using the provided scope/prompt/severity/rules, include a recommended answer, and then wait. Use say_text only when the coding agent needs to push a concise user-visible message into a specific voice channel; include channelId, text, and priority. Mark handled event IDs with mark_events_delivered after the update is summarized or acted on.",
        },
      };
    case "notifications/initialized":
      return null;
    case "tools/list":
      return {
        jsonrpc: "2.0",
        id,
        result: { tools },
      };
    case "tools/call":
      return handleToolCall(id, request.params as ToolCallParams);
    case "ping":
      return {
        jsonrpc: "2.0",
        id,
        result: {},
      };
    default:
      return {
        jsonrpc: "2.0",
        id,
        error: {
          code: -32601,
          message: `Method not found: ${request.method ?? "undefined"}`,
        },
      };
  }
}

function handleToolCall(id: JsonRpcRequest["id"], params?: ToolCallParams) {
  const args = params?.arguments ?? {};
  let result: unknown;

  switch (params?.name) {
    case "start_call":
      result = startCall({
        id: stringArg(args.sessionId),
        contact: stringArg(args.contact),
        scenario: stringArg(args.scenario),
        openingLine: stringArg(args.openingLine),
      });
      break;
    case "send_utterance":
      result = addUtterance({
        role: roleArg(args.role),
        text: stringArg(args.text) ?? "",
      });
      break;
    case "get_call_state":
      result = getCallState();
      break;
    case "get_call_summary":
      result = getCallSummary();
      break;
    case "get_full_transcript":
      result = getFullTranscript();
      break;
    case "get_new_call_events":
      result = getCallEvents({
        includeDelivered: Boolean(args.includeDelivered),
        limit: numberArg(args.limit),
      });
      break;
    case "get_pending_call_batch":
      result = getPendingCallBatch({
        includeDelivered: Boolean(args.includeDelivered),
        limit: numberArg(args.limit),
        settleMs: numberArg(args.settleMs),
      });
      break;
    case "mark_events_delivered":
      result = markEventsDelivered(stringArrayArg(args.eventIds));
      break;
    case "say_text":
      result = addChannelMessage({
        channelId: stringArg(args.channelId),
        text: stringArg(args.text),
        priority: stringArg(args.priority),
      });
      break;
    case "get_channel_messages":
      result = getChannelMessages({
        includeRead: Boolean(args.includeRead),
        channelId: stringArg(args.channelId),
        limit: numberArg(args.limit),
      });
      break;
    case "mark_channel_messages":
      result = markChannelMessages({
        messageIds: stringArrayArg(args.messageIds),
        read: true,
        spoken: true,
      });
      break;
    case "set_mute":
      result = setMute(Boolean(args.muted));
      break;
    case "end_call":
      result = endCall(stringArg(args.summary));
      break;
    case "reset_call":
      result = resetCall();
      break;
    default:
      return {
        jsonrpc: "2.0",
        id,
        error: {
          code: -32602,
          message: `Unknown tool: ${params?.name ?? "undefined"}`,
        },
      };
  }

  return {
    jsonrpc: "2.0",
    id,
    result: {
      content: [
        {
          type: "text",
          text: JSON.stringify(result, null, 2),
        },
      ],
    },
  };
}

function rpcError(id: JsonRpcRequest["id"], code: number, message: string) {
  return Response.json(
    {
      jsonrpc: "2.0",
      id,
      error: { code, message },
    },
    { status: 400 },
  );
}

function stringArg(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function roleArg(value: unknown): "user" | "assistant" | "system" | undefined {
  return value === "user" || value === "assistant" || value === "system"
    ? value
    : undefined;
}

function numberArg(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function stringArrayArg(value: unknown): string[] | undefined {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : undefined;
}
