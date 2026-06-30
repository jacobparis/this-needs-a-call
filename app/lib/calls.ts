import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export type CallStatus = "idle" | "ringing" | "active" | "ended";
export type TranscriptRole = "user" | "assistant" | "system";

export type TranscriptEntry = {
  id: string;
  role: TranscriptRole;
  text: string;
  createdAt: string;
};

export type GrillMode = "quick" | "deep" | "focused";

export type GrillSession = {
  id: string;
  active: boolean;
  scope: string;
  mode: GrillMode;
  backlog: string[];
  lastFinding: string | null;
  startedAt: string | null;
  updatedAt: string | null;
};

export type CallState = {
  id: string;
  contact: string;
  scenario: string;
  status: CallStatus;
  startedAt: string | null;
  endedAt: string | null;
  muted: boolean;
  grillSession: GrillSession;
  transcript: TranscriptEntry[];
};

export type CallEvent = {
  id: string;
  sessionId?: string;
  sequence: number;
  batchId: string;
  type: string;
  detail: string;
  payload?: unknown;
  createdAt: string;
  delivered: boolean;
};

export type CallSummary = {
  status: CallStatus;
  contact: string;
  scenario: string;
  startedAt: string | null;
  endedAt: string | null;
  messageCount: number;
  grillSession: GrillSession;
  latestMessages: TranscriptEntry[];
  summary: string;
};

export type FullTranscript = {
  call: Omit<CallState, "transcript">;
  transcript: TranscriptEntry[];
  conversation: TranscriptEntry[];
  text: string;
  conversationText: string;
};

export type CallEventBatch = {
  status: "empty" | "settling" | "ready";
  batchId: string | null;
  settleMs: number;
  latestEventAgeMs: number | null;
  eventCount: number;
  events: CallEvent[];
  guidance: string;
};

export type ChannelMessagePriority = "low" | "normal" | "high";

export type ChannelMessage = {
  id: string;
  channelId: string;
  text: string;
  priority: ChannelMessagePriority;
  createdAt: string;
  read: boolean;
  spoken: boolean;
};

export type ThisNeedsACallStore = {
  sessions: Record<string, SessionStore>;
  currentSessionId: string;
};

export type CallSessionAccess = {
  id: string;
  secret: string;
};

export type CallSessionSummary = {
  id: string;
  contact: string;
  scenario: string;
  status: CallStatus;
  startedAt: string | null;
  endedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ThisNeedsACallSessionStore = {
  current: CallState;
  events: CallEvent[];
  channelMessages: ChannelMessage[];
  nextSequence: number;
  secretHash: string;
  createdAt: string;
  updatedAt: string;
};

type SessionStore = ThisNeedsACallSessionStore;

const scenarios = {
  intake:
    "You are a calm engineering intake assistant. Ask what changed, what the user expected, and what evidence exists.",
  incident:
    "You are an incident commander. Gather impact, timeline, mitigations, and next decisions.",
  review:
    "You are a code-review operator. Ask for the diff, test signal, risk area, and rollout plan.",
};

const defaultCall: CallState = {
  id: "call_demo",
  contact: "This Needs A Call",
  scenario: "intake",
  status: "idle",
  startedAt: null,
  endedAt: null,
  muted: false,
  grillSession: defaultGrillSession(),
  transcript: [],
};

const globalStore = globalThis as typeof globalThis & {
  __thisNeedsACall?: ThisNeedsACallStore;
};

export function getStore(): ThisNeedsACallStore {
  if (!globalStore.__thisNeedsACall) {
    const session = createSessionStore("call_demo", randomSecret());
    globalStore.__thisNeedsACall = {
      sessions: {
        [session.current.id]: session,
      },
      currentSessionId: session.current.id,
    };
  }

  if (!globalStore.__thisNeedsACall.sessions) {
    const legacy = globalStore.__thisNeedsACall as unknown as {
      current?: CallState;
      events?: CallEvent[];
      channelMessages?: ChannelMessage[];
      nextSequence?: number;
    };
    const now = new Date().toISOString();
    const current = legacy.current ?? structuredClone(defaultCall);
    globalStore.__thisNeedsACall = {
      sessions: {
        [current.id]: {
          current,
          events: legacy.events ?? [],
          channelMessages: legacy.channelMessages ?? [],
          nextSequence: legacy.nextSequence ?? 1,
          secretHash: hashSecret(randomSecret()),
          createdAt: current.startedAt ?? now,
          updatedAt: now,
        },
      },
      currentSessionId: current.id,
    };
  }

  return globalStore.__thisNeedsACall;
}

function getActiveSessionStore(): SessionStore {
  const store = getStore();
  const session = store.sessions[store.currentSessionId];
  if (session) {
    return session;
  }

  const fallback = Object.values(store.sessions)[0] ?? createSessionStore();
  store.sessions[fallback.current.id] = fallback;
  store.currentSessionId = fallback.current.id;
  return fallback;
}

export function getCallStoreSnapshot(): ThisNeedsACallStore {
  return structuredClone(getStore());
}

export function replaceCallStore(store: ThisNeedsACallStore): void {
  globalStore.__thisNeedsACall = normalizeStore(store);
}

function normalizeStore(store: ThisNeedsACallStore): ThisNeedsACallStore {
  const now = new Date().toISOString();
  const sessions = Object.fromEntries(
    Object.entries(store.sessions ?? {})
      .filter(([, session]) => session?.current?.id)
      .map(([id, session]) => [
        id,
        {
          current: {
            ...structuredClone(defaultCall),
            ...session.current,
            id: session.current.id,
            grillSession: {
              ...defaultGrillSession(),
              ...session.current.grillSession,
            },
            transcript: Array.isArray(session.current.transcript)
              ? session.current.transcript
              : [],
          },
          events: Array.isArray(session.events) ? session.events.slice(-200) : [],
          channelMessages: Array.isArray(session.channelMessages)
            ? session.channelMessages.slice(-100)
            : [],
          nextSequence:
            typeof session.nextSequence === "number" && Number.isFinite(session.nextSequence)
              ? session.nextSequence
              : 1,
          secretHash:
            typeof session.secretHash === "string"
              ? session.secretHash
              : hashSecret(randomSecret()),
          createdAt:
            typeof session.createdAt === "string" ? session.createdAt : now,
          updatedAt:
            typeof session.updatedAt === "string" ? session.updatedAt : now,
        },
      ]),
  );

  if (Object.keys(sessions).length === 0) {
    const session = createSessionStore("call_demo", randomSecret());
    sessions[session.current.id] = session;
  }

  const currentSessionId =
    store.currentSessionId && sessions[store.currentSessionId]
      ? store.currentSessionId
      : Object.keys(sessions)[0];

  return {
    sessions,
    currentSessionId,
  };
}

function getSessionStore(sessionId: string): SessionStore | null {
  return getStore().sessions[sessionId] ?? null;
}

export function setActiveCallSession(sessionId: string): boolean {
  const store = getStore();
  if (!store.sessions[sessionId]) {
    return false;
  }

  store.currentSessionId = sessionId;
  return true;
}

export function createCallSessionAccess(input?: {
  contact?: string;
  scenario?: keyof typeof scenarios | string;
  openingLine?: string;
  agent?: string;
}): { access: CallSessionAccess; call: CallState } {
  const access = {
    id: makeId("call"),
    secret: randomSecret(),
  };
  const store = getStore();
  store.sessions[access.id] = createSessionStore(access.id, access.secret);
  store.currentSessionId = access.id;
  const call = startCall({
    id: access.id,
    contact: input?.contact,
    scenario: input?.scenario,
    openingLine: input?.openingLine,
  });
  return { access, call };
}

export function listCallSessions(sessionIds: string[]): CallSessionSummary[] {
  const idSet = new Set(sessionIds);
  return Object.values(getStore().sessions)
    .filter((session) => idSet.has(session.current.id))
    .map((session) => ({
      id: session.current.id,
      contact: session.current.contact,
      scenario: session.current.scenario,
      status: session.current.status,
      startedAt: session.current.startedAt,
      endedAt: session.current.endedAt,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
    }))
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

export function verifyCallSessionAccess(access: CallSessionAccess): boolean {
  const session = getSessionStore(access.id);
  if (!session) {
    return false;
  }

  return secretsEqual(session.secretHash, hashSecret(access.secret));
}

export function hasCallSession(sessionId: string): boolean {
  return Boolean(getSessionStore(sessionId));
}

export function getCallState(): CallState {
  return getActiveSessionStore().current;
}

export function resetCall(): CallState {
  const session = getActiveSessionStore();
  session.current = {
    ...structuredClone(defaultCall),
    id: session.current.id,
    grillSession: defaultGrillSession(),
    transcript: [],
  };
  session.events = [];
  session.channelMessages = [];
  session.nextSequence = 1;
  session.updatedAt = new Date().toISOString();
  return session.current;
}

export function startCall(input?: {
  id?: string;
  contact?: string;
  scenario?: keyof typeof scenarios | string;
  openingLine?: string;
}): CallState {
  const store = getStore();
  if (input?.id?.trim() && store.sessions[input.id.trim()]) {
    store.currentSessionId = input.id.trim();
  } else if (input?.id?.trim()) {
    const nextSession = createSessionStore(input.id.trim());
    store.sessions[nextSession.current.id] = nextSession;
    store.currentSessionId = nextSession.current.id;
  }

  const session = getActiveSessionStore();
  const existing = session.current;
  if (input?.id && existing.id === input.id && existing.status === "active") {
    return existing;
  }

  const now = new Date().toISOString();
  const scenario = input?.scenario ?? "intake";
  const contact = input?.contact?.trim() || "This Needs A Call";
  const openingLine = input?.openingLine?.trim();
  const systemPrompt =
    scenario in scenarios ? scenarios[scenario as keyof typeof scenarios] : null;

  session.current = {
    id: input?.id?.trim() || session.current.id || makeId("call"),
    contact,
    scenario: String(scenario),
    status: "active",
    startedAt: now,
    endedAt: null,
    muted: false,
    grillSession: defaultGrillSession(),
    transcript: [
      ...(systemPrompt
        ? [
            {
              id: makeId("system"),
              role: "system" as const,
              text: systemPrompt,
              createdAt: now,
            },
          ]
        : []),
      ...(openingLine
        ? [
            {
              id: makeId("system"),
              role: "system" as const,
              text: openingLine,
              createdAt: now,
            },
          ]
        : []),
    ],
  };
  addCallEvent({
    type: "call_started",
    detail: `${contact} started a ${String(scenario)} call.`,
  });

  session.updatedAt = now;
  return session.current;
}

export function addUtterance(input: {
  role?: TranscriptRole;
  text: string;
}): CallState {
  const store = getActiveSessionStore();
  const text = input.text.trim();

  if (!text) {
    return store.current;
  }

  if (store.current.status === "idle" || store.current.status === "ended") {
    startCall();
  }

  const entry: TranscriptEntry = {
    id: makeId(input.role ?? "user"),
    role: input.role ?? "user",
    text,
    createdAt: new Date().toISOString(),
  };

  store.current = {
    ...store.current,
    status: "active",
    transcript: [...store.current.transcript, entry],
  };
  addCallEvent({
    type: "utterance",
    detail: `${input.role ?? "user"}: ${text}`,
    payload: {
      kind: "transcript_entry",
      entry,
    },
  });

  return store.current;
}

export function endCall(summary?: string): CallState {
  const store = getActiveSessionStore();
  const now = new Date().toISOString();
  const transcript = summary?.trim()
    ? [
        ...store.current.transcript,
        {
          id: makeId("system"),
          role: "system" as const,
          text: `Call summary: ${summary.trim()}`,
          createdAt: now,
        },
      ]
    : store.current.transcript;

  store.current = {
    ...store.current,
    status: "ended",
    endedAt: now,
    transcript,
  };
  addCallEvent({
    type: "call_ended",
    detail: summary?.trim() || "Call ended.",
  });

  return store.current;
}

export function setMute(muted: boolean): CallState {
  const store = getActiveSessionStore();
  store.current = {
    ...store.current,
    muted,
  };
  return store.current;
}

export function setGrillMode(input: {
  active: boolean;
  scope?: string;
  mode?: GrillMode | string;
}): CallState {
  const store = getActiveSessionStore();
  const now = new Date().toISOString();
  const existing = store.current.grillSession;
  const active = input.active;
  const scope = input.scope?.trim() || existing.scope || "current codebase";
  const mode = grillModeArg(input.mode) ?? existing.mode;

  store.current = {
    ...store.current,
    grillSession: {
      ...existing,
      id: active && !existing.active ? makeId("grill") : existing.id,
      active,
      scope,
      mode,
      backlog: active ? existing.backlog : [],
      lastFinding: active ? existing.lastFinding : null,
      startedAt: active ? existing.startedAt ?? now : existing.startedAt,
      updatedAt: now,
    },
  };
  addCallEvent({
    type: "grill_mode",
    detail: JSON.stringify({
      type: "grill_mode",
      active,
      sessionId: store.current.grillSession.id,
      scope,
      mode,
    }),
  });
  if (active) {
    const prompt = selectGrillPrompt(
      `Start grilling ${scope}. Walk the design tree.`,
      store.current.grillSession,
    );
    store.current = {
      ...store.current,
      grillSession: {
        ...store.current.grillSession,
        backlog: [...store.current.grillSession.backlog, prompt].slice(-12),
        lastFinding: prompt,
      },
    };
    addGrillEvent({
      session: store.current.grillSession,
      prompt,
      userTurn: "grill mode started",
    });
  }

  return store.current;
}

export function recordGrillTurn(input: { userTurn: string }): CallEvent | null {
  const store = getActiveSessionStore();
  const userTurn = input.userTurn.trim();
  const session = store.current.grillSession;

  if (!session.active || !userTurn) {
    return null;
  }

  const prompt = selectGrillPrompt(userTurn, session);
  const now = new Date().toISOString();

  store.current = {
    ...store.current,
    grillSession: {
      ...session,
      backlog: [...session.backlog, prompt].slice(-12),
      lastFinding: prompt,
      updatedAt: now,
    },
  };

  return addGrillEvent({
    session: store.current.grillSession,
    prompt,
    userTurn,
  });
}

function addGrillEvent(input: {
  session: GrillSession;
  prompt: string;
  userTurn: string;
}): CallEvent {
  return addCallEvent({
    type: "grill",
    detail: JSON.stringify({
      type: "grill",
      sessionId: input.session.id,
      scope: input.session.scope,
      mode: input.session.mode,
      severity: input.session.mode === "quick" ? "medium" : "high",
      prompt: input.prompt,
      userTurn: input.userTurn,
      rules: [
        "Interview relentlessly until the plan is explicit and internally consistent.",
        "Walk the decision tree one branch at a time; resolve dependencies before moving on.",
        "Ask exactly one question now.",
        "Include your recommended answer with the question.",
        "If code context can answer part of the question, inspect the code instead of asking the user for that fact.",
      ],
      expectedSignal:
        "The coding agent should inspect relevant code context when useful, ask exactly one pointed Grill Me question, include a recommended answer, then wait for the user's answer before continuing.",
    }),
  });
}

export function addCallEvent(input: {
  type: string;
  detail: string;
  payload?: unknown;
  id?: string;
  sequence?: number;
  batchId?: string;
  createdAt?: string;
  delivered?: boolean;
  publish?: boolean;
}): CallEvent {
  const store = getActiveSessionStore();
  const now = input.createdAt ? Date.parse(input.createdAt) : Date.now();
  const createdAt = input.createdAt ?? new Date(now).toISOString();
  const sequence = input.sequence ?? store.nextSequence;
  const existing = store.events.find((entry) => entry.id === input.id);
  const event: CallEvent = {
    id: input.id ?? makeId("event"),
    sessionId: store.current.id,
    sequence,
    batchId: input.batchId ?? makeBatchId(now),
    type: input.type,
    detail: input.detail,
    payload: input.payload,
    createdAt,
    delivered: existing?.delivered ?? input.delivered ?? false,
  };
  store.nextSequence = Math.max(store.nextSequence, sequence + 1);
  store.events = [
    ...store.events.filter((existing) => existing.id !== event.id),
    event,
  ].slice(-200);
  store.updatedAt = createdAt;
  if (input.publish !== false) {
    void import("@/app/lib/call-queue").then(({ enqueueCallEvent }) =>
      enqueueCallEvent(event),
    );
  }
  return event;
}

export function getCallEvents(input?: {
  includeDelivered?: boolean;
  limit?: number;
}): CallEvent[] {
  const store = getActiveSessionStore();
  const limit = Math.max(1, Math.min(input?.limit ?? 25, 100));
  const events = input?.includeDelivered
    ? store.events
    : store.events.filter((event) => !event.delivered);
  return events.slice(-limit);
}

export function getPendingCallBatch(input?: {
  includeDelivered?: boolean;
  limit?: number;
  settleMs?: number;
}): CallEventBatch {
  const settleMs = Math.max(250, Math.min(input?.settleMs ?? 2500, 15000));
  silentlyDeliverIncompleteFragments();
  const events = getCallEvents({
    includeDelivered: input?.includeDelivered,
    limit: input?.limit,
  });

  if (events.length === 0) {
    return {
      status: "empty",
      batchId: null,
      settleMs,
      latestEventAgeMs: null,
      eventCount: 0,
      events: [],
      guidance: "No unread voice-call events are available.",
    };
  }

  const latestEventAt = Math.max(
    ...events.map((event) => Date.parse(event.createdAt)).filter(Number.isFinite),
  );
  const latestEventAgeMs = Math.max(0, Date.now() - latestEventAt);
  const status = latestEventAgeMs < settleMs ? "settling" : "ready";
  const batchId = events.at(-1)?.batchId ?? null;

  return {
    status,
    batchId,
    settleMs,
    latestEventAgeMs,
    eventCount: events.length,
    events,
    guidance:
      status === "settling"
        ? "The voice event batch is still settling. Do not summarize, act, or mark delivered yet; poll again after more speech can arrive."
        : "The voice event batch is ready. Use these events as the input batch, then mark only handled event IDs delivered.",
  };
}

function silentlyDeliverIncompleteFragments(): void {
  const store = getActiveSessionStore();
  store.events = store.events.map((event) =>
    !event.delivered && isIncompleteFragment(event)
      ? { ...event, delivered: true }
      : event,
  );
}

function isIncompleteFragment(event: CallEvent): boolean {
  if (
    ![
      "user_transcript",
      "realtime_input-transcription-completed",
      "utterance",
    ].includes(event.type)
  ) {
    return false;
  }

  const text = transcriptTextFromEvent(event).trim();
  if (!text) {
    return true;
  }

  const normalized = text.replace(/^user:\s*/i, "").trim();
  const words = normalized.split(/\s+/).filter(Boolean);

  return (
    normalized.endsWith("...") ||
    normalized.endsWith(",") ||
    words.length <= 2
  );
}

function transcriptTextFromEvent(event: CallEvent): string {
  const entry = transcriptEntryPayload(event.payload);
  if (entry) {
    return entry.text;
  }

  return event.detail;
}

export function markEventsDelivered(ids?: string[]): CallEvent[] {
  const store = getActiveSessionStore();
  const idSet = ids && ids.length > 0 ? new Set(ids) : null;
  store.events = store.events.map((event) =>
    !idSet || idSet.has(event.id) ? { ...event, delivered: true } : event,
  );
  return store.events;
}

export function addChannelMessage(input: {
  channelId?: string;
  text?: string;
  priority?: string;
}): ChannelMessage | null {
  const text = input.text?.trim();
  if (!text) {
    return null;
  }

  const message: ChannelMessage = {
    id: makeId("channel_message"),
    channelId: input.channelId?.trim() || "core",
    text,
    priority: priorityArg(input.priority),
    createdAt: new Date().toISOString(),
    read: false,
    spoken: false,
  };
  const store = getActiveSessionStore();
  store.channelMessages = [...store.channelMessages, message].slice(-100);
  addCallEvent({
    type: "channel_message",
    detail: `${message.channelId}: ${message.text}`,
    payload: { kind: "channel_message", message },
  });
  return message;
}

export function getChannelMessages(input?: {
  includeRead?: boolean;
  channelId?: string;
  limit?: number;
}): ChannelMessage[] {
  const store = getActiveSessionStore();
  const limit = Math.max(1, Math.min(input?.limit ?? 50, 100));
  const messages = store.channelMessages.filter((message) => {
    if (!input?.includeRead && message.read) {
      return false;
    }
    if (input?.channelId && message.channelId !== input.channelId) {
      return false;
    }
    return true;
  });
  return messages.slice(-limit);
}

export function markChannelMessages(input?: {
  messageIds?: string[];
  read?: boolean;
  spoken?: boolean;
}): ChannelMessage[] {
  const store = getActiveSessionStore();
  const idSet =
    input?.messageIds && input.messageIds.length > 0
      ? new Set(input.messageIds)
      : null;
  store.channelMessages = store.channelMessages.map((message) =>
    !idSet || idSet.has(message.id)
      ? {
          ...message,
          read: input?.read ?? message.read,
          spoken: input?.spoken ?? message.spoken,
        }
      : message,
  );
  return store.channelMessages;
}

export function getCallSummary(): CallSummary {
  const call = getCallState();
  const latestMessages = call.transcript.slice(-8);
  const summary =
    latestMessages.length === 0
      ? `${call.contact} is ${call.status}; no transcript messages have been captured yet.`
      : latestMessages
          .map((entry) => `${entry.role}: ${entry.text}`)
          .join("\n");

  return {
    status: call.status,
    contact: call.contact,
    scenario: call.scenario,
    startedAt: call.startedAt,
    endedAt: call.endedAt,
    messageCount: call.transcript.length,
    grillSession: call.grillSession,
    latestMessages,
    summary,
  };
}

export function getFullTranscript(): FullTranscript {
  const call = getCallState();
  const transcript = mergedTranscript(call.transcript, getActiveSessionStore().events);
  const conversation = transcript.filter(
    (entry) => entry.role === "user" || entry.role === "assistant",
  );
  const text = formatTranscript(transcript);
  const conversationText = formatTranscript(conversation);

  return {
    call: {
      id: call.id,
      contact: call.contact,
      scenario: call.scenario,
      status: call.status,
      startedAt: call.startedAt,
      endedAt: call.endedAt,
      muted: call.muted,
      grillSession: call.grillSession,
    },
    transcript,
    conversation,
    text,
    conversationText,
  };
}

function mergedTranscript(
  stateEntries: TranscriptEntry[],
  events: CallEvent[],
): TranscriptEntry[] {
  const entriesById = new Map<string, TranscriptEntry>();

  for (const entry of stateEntries) {
    entriesById.set(entry.id, entry);
  }

  for (const event of events) {
    const entry = transcriptEntryPayload(event.payload);
    if (entry) {
      entriesById.set(entry.id, entry);
    }
  }

  return [...entriesById.values()].sort(
    (left, right) =>
      Date.parse(left.createdAt) - Date.parse(right.createdAt) ||
      left.id.localeCompare(right.id),
  );
}

function transcriptEntryPayload(value: unknown): TranscriptEntry | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }

  const payload = value as { kind?: unknown; entry?: unknown };
  if (payload.kind !== "transcript_entry") {
    return null;
  }

  const entry = payload.entry as Partial<TranscriptEntry> | null;
  if (
    !entry ||
    typeof entry.id !== "string" ||
    !isTranscriptRole(entry.role) ||
    typeof entry.text !== "string" ||
    typeof entry.createdAt !== "string"
  ) {
    return null;
  }

  return {
    id: entry.id,
    role: entry.role,
    text: entry.text,
    createdAt: entry.createdAt,
  };
}

function isTranscriptRole(value: unknown): value is TranscriptRole {
  return value === "user" || value === "assistant" || value === "system";
}

function priorityArg(value: unknown): ChannelMessagePriority {
  return value === "low" || value === "high" ? value : "normal";
}

function formatTranscript(entries: TranscriptEntry[]): string {
  return entries
    .map((entry) => [entry.createdAt, `${entry.role}:`, entry.text].join("\n"))
    .join("\n\n");
}

function defaultGrillSession(): GrillSession {
  return {
    id: "grill_idle",
    active: false,
    scope: "current codebase",
    mode: "focused",
    backlog: [],
    lastFinding: null,
    startedAt: null,
    updatedAt: null,
  };
}

function grillModeArg(value: unknown): GrillMode | undefined {
  return value === "quick" || value === "deep" || value === "focused"
    ? value
    : undefined;
}

function selectGrillPrompt(userTurn: string, session: GrillSession): string {
  const scope = session.scope || "current codebase";
  const lowerTurn = userTurn.toLowerCase();
  const questionPrefix =
    "Ask one Grill Me question only, then stop. Include `Recommended answer:` after the question.";

  if (lowerTurn.includes("implement") || lowerTurn.includes("build")) {
    return `${questionPrefix} For ${scope}, what concrete user-visible behavior proves this implementation works, and which existing code path should the coding agent inspect before asking the user to validate it?`;
  }

  if (lowerTurn.includes("mcp") || lowerTurn.includes("codex")) {
    return `${questionPrefix} For ${scope}, where exactly is the boundary between voice input, MCP transport, voice-agent conversation, and coding-agent execution, and what invariant prevents work from happening in the wrong layer?`;
  }

  if (lowerTurn.includes("transcript") || lowerTurn.includes("message")) {
    return `${questionPrefix} For ${scope}, what transcript or message-ordering invariant must hold across partial, missing, retried, and injected realtime events, and where in the code should the coding agent verify it first?`;
  }

  if (lowerTurn.includes("start grilling") || lowerTurn.includes("walk the design tree")) {
    return `${questionPrefix} For ${scope}, what is the exact plan or design decision being grilled, and what is the first unresolved branch in that decision tree?`;
  }

  return `${questionPrefix} For ${scope}, what is the weakest assumption in this plan, and what code or runtime evidence would falsify it before we spend more effort?`;
}

function createSessionStore(id = makeId("call"), secret = randomSecret()): SessionStore {
  const now = new Date().toISOString();
  return {
    current: {
      ...structuredClone(defaultCall),
      id,
      grillSession: defaultGrillSession(),
      transcript: [],
    },
    events: [],
    channelMessages: [],
    nextSequence: 1,
    secretHash: hashSecret(secret),
    createdAt: now,
    updatedAt: now,
  };
}

function randomSecret(): string {
  return randomBytes(32).toString("base64url");
}

function hashSecret(secret: string): string {
  return createHash("sha256").update(secret).digest("base64url");
}

function secretsEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return (
    leftBuffer.byteLength === rightBuffer.byteLength &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}

function makeId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function makeBatchId(timeMs: number): string {
  return `batch_${Math.floor(timeMs / 5000).toString(36)}`;
}
