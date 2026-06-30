import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export type CallStatus = "idle" | "ringing" | "active" | "ended";
export type TranscriptRole = "user" | "assistant" | "system";

export type TranscriptEntry = {
  id: string;
  role: TranscriptRole;
  text: string;
  createdAt: string;
};

export type CallState = {
  id: string;
  contact: string;
  status: CallStatus;
  startedAt: string | null;
  endedAt: string | null;
  muted: boolean;
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
  startedAt: string | null;
  endedAt: string | null;
  messageCount: number;
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

export type VoiceMessagePriority = "low" | "normal" | "high";

export type VoiceMessage = {
  id: string;
  text: string;
  priority: VoiceMessagePriority;
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
  status: CallStatus;
  startedAt: string | null;
  endedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ThisNeedsACallSessionStore = {
  current: CallState;
  events: CallEvent[];
  voiceMessages: VoiceMessage[];
  nextSequence: number;
  secretHash: string;
  createdAt: string;
  updatedAt: string;
};

type SessionStore = ThisNeedsACallSessionStore;

const defaultCall: CallState = {
  id: "call_demo",
  contact: "This Needs A Call",
  status: "idle",
  startedAt: null,
  endedAt: null,
  muted: false,
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
      voiceMessages?: VoiceMessage[];
      nextSequence?: number;
    };
    const now = new Date().toISOString();
    const current = legacy.current ?? structuredClone(defaultCall);
    globalStore.__thisNeedsACall = {
      sessions: {
        [current.id]: {
          current,
          events: legacy.events ?? [],
          voiceMessages: legacy.voiceMessages ?? [],
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
      .map(([id, session]) => {
        return [
          id,
          {
          current: {
            ...structuredClone(defaultCall),
            ...session.current,
            id: session.current.id,
            transcript: Array.isArray(session.current.transcript)
              ? session.current.transcript
              : [],
          },
          events: Array.isArray(session.events) ? session.events.slice(-200) : [],
          voiceMessages: Array.isArray(session.voiceMessages)
            ? session.voiceMessages.slice(-100)
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
        ];
      }),
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
    transcript: [],
  };
  session.events = [];
  session.voiceMessages = [];
  session.nextSequence = 1;
  session.updatedAt = new Date().toISOString();
  return session.current;
}

export function startCall(input?: {
  id?: string;
  contact?: string;
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
  const contact = input?.contact?.trim() || "This Needs A Call";
  const openingLine = input?.openingLine?.trim();

  session.current = {
    id: input?.id?.trim() || session.current.id || makeId("call"),
    contact,
    status: "active",
    startedAt: now,
    endedAt: null,
    muted: false,
    transcript: [
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
    detail: `${contact} started a call.`,
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

export function addVoiceMessage(input: {
  text?: string;
  priority?: string;
}): VoiceMessage | null {
  const text = input.text?.trim();
  if (!text) {
    return null;
  }

  const message: VoiceMessage = {
    id: makeId("voice_message"),
    text,
    priority: priorityArg(input.priority),
    createdAt: new Date().toISOString(),
    read: false,
    spoken: false,
  };
  const store = getActiveSessionStore();
  store.voiceMessages = [...store.voiceMessages, message].slice(-100);
  addCallEvent({
    type: "voice_message",
    detail: message.text,
    payload: { kind: "voice_message", message },
  });
  return message;
}

export function getVoiceMessages(input?: {
  includeRead?: boolean;
  limit?: number;
}): VoiceMessage[] {
  const store = getActiveSessionStore();
  const limit = Math.max(1, Math.min(input?.limit ?? 50, 100));
  const messages = store.voiceMessages.filter((message) => {
    if (!input?.includeRead && message.read) {
      return false;
    }
    return true;
  });
  return messages.slice(-limit);
}

export function markVoiceMessages(input?: {
  messageIds?: string[];
  read?: boolean;
  spoken?: boolean;
}): VoiceMessage[] {
  const store = getActiveSessionStore();
  const idSet =
    input?.messageIds && input.messageIds.length > 0
      ? new Set(input.messageIds)
      : null;
  store.voiceMessages = store.voiceMessages.map((message) =>
    !idSet || idSet.has(message.id)
      ? {
          ...message,
          read: input?.read ?? message.read,
          spoken: input?.spoken ?? message.spoken,
      }
      : message,
  );
  return store.voiceMessages;
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
    startedAt: call.startedAt,
    endedAt: call.endedAt,
    messageCount: call.transcript.length,
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
      status: call.status,
      startedAt: call.startedAt,
      endedAt: call.endedAt,
      muted: call.muted,
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

function priorityArg(value: unknown): VoiceMessagePriority {
  return value === "low" || value === "high" ? value : "normal";
}

function formatTranscript(entries: TranscriptEntry[]): string {
  return entries
    .map((entry) => [entry.createdAt, `${entry.role}:`, entry.text].join("\n"))
    .join("\n\n");
}

function createSessionStore(id = makeId("call"), secret = randomSecret()): SessionStore {
  const now = new Date().toISOString();
  return {
    current: {
      ...structuredClone(defaultCall),
      id,
      transcript: [],
    },
    events: [],
    voiceMessages: [],
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
