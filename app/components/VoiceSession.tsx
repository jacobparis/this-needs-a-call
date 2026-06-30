"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  CallSessionSummary,
  TranscriptEntry,
  VoiceMessage,
} from "@/app/lib/calls";

declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext;
  }
}

type ConnectionState = "disconnected" | "connecting" | "connected" | "error";
type MicPermissionState = "unknown" | "prompt" | "granted" | "denied";
type RealtimeEvent = {
  type: string;
  detail: string;
  at: string;
};
const inputSampleRate = 24000;
const defaultCodingAgentName = "Codex";
const voiceName = "alloy";

type VoiceSessionProps = {
  initialSessionId: string;
};

export function VoiceSession({ initialSessionId }: VoiceSessionProps) {
  const [connection, setConnection] = useState<ConnectionState>("disconnected");
  const [, setMicPermission] = useState<MicPermissionState>("unknown");
  const [isCapturing, setIsCapturing] = useState(false);
  const [micLevel, setMicLevel] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [events, setEvents] = useState<RealtimeEvent[]>([]);
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [elapsed, setElapsed] = useState("00:00");
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessions, setSessions] = useState<CallSessionSummary[]>([]);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [sessionReady, setSessionReady] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const micCleanupRef = useRef<(() => void) | null>(null);
  const playbackContextRef = useRef<AudioContext | null>(null);
  const playbackSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const playbackTimeRef = useRef(0);
  const lastBargeInAtRef = useRef(-Infinity);
  const activeResponseRef = useRef(false);
  const pendingVoiceMessagesRef = useRef<VoiceMessage[]>([]);
  const voiceMessageDrainTimerRef = useRef<number | null>(null);
  const drainVoiceMessageQueueRef = useRef<() => void>(() => {});
  const autostartedRef = useRef(false);
  const assistantDraftRef = useRef("");
  const assistantDraftIdRef = useRef<string | null>(null);
  const userDraftRef = useRef("");
  const sessionIdRef = useRef<string | null>(null);

  useEffect(() => {
    sessionIdRef.current = sessionId;
  }, [sessionId]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      if (!startedAt) {
        setElapsed("00:00");
        return;
      }
      const seconds = Math.floor((Date.now() - startedAt) / 1000);
      const minutes = Math.floor(seconds / 60);
      const remainder = seconds % 60;
      setElapsed(
        `${minutes.toString().padStart(2, "0")}:${remainder
          .toString()
          .padStart(2, "0")}`,
      );
    }, 500);

    return () => window.clearInterval(interval);
  }, [startedAt]);

  useEffect(() => {
    return () => {
      if (voiceMessageDrainTimerRef.current !== null) {
        window.clearTimeout(voiceMessageDrainTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!("permissions" in navigator)) {
      return;
    }

    void navigator.permissions
      .query({ name: "microphone" as PermissionName })
      .then((permission) => {
        setMicPermission(permission.state);
        permission.onchange = () => setMicPermission(permission.state);
      })
      .catch(() => {
        setMicPermission("unknown");
      });
  }, []);

  const applySessionPayload = useCallback(
    (payload: {
      activeSession?: string | null;
      sessions?: CallSessionSummary[];
      shareUrl?: string | null;
    }) => {
      setSessionId(payload.activeSession ?? null);
      sessionIdRef.current = payload.activeSession ?? null;
      setSessions(payload.sessions ?? []);
      setShareUrl(payload.shareUrl ?? null);
    },
    [],
  );

  const refreshSessionInfo = useCallback(
    async (targetSessionId?: string | null) => {
      const params = new URLSearchParams();
      if (targetSessionId) {
        params.set("session", targetSessionId);
      }
      const response = await fetch(`/api/call-session?${params}`, {
        cache: "no-store",
      }).catch(() => null);
      if (!response?.ok) {
        setSessionReady(true);
        return;
      }
      const payload = (await response.json().catch(() => null)) as {
        activeSession?: string | null;
        sessions?: CallSessionSummary[];
        shareUrl?: string | null;
      } | null;
      if (payload) {
        applySessionPayload(payload);
      }
      setSessionReady(true);
    },
    [applySessionPayload],
  );

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const joinToken = params.get("join");
    if (!joinToken) {
      window.setTimeout(() => {
        void refreshSessionInfo(initialSessionId);
      }, 0);
      return;
    }

    let cancelled = false;
    async function claimSession() {
      const response = await fetch("/api/call-session/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: joinToken }),
      }).catch(() => null);

      if (!response?.ok || cancelled) {
        setError("This call link is invalid or expired.");
        setSessionReady(true);
        return;
      }

      const payload = (await response.json().catch(() => null)) as {
        activeSession?: string | null;
        sessions?: CallSessionSummary[];
      } | null;
      if (payload) {
        applySessionPayload(payload);
      }
      params.delete("join");
      const activeSession = payload?.activeSession ?? initialSessionId;
      const query = params.toString();
      const nextUrl = `/sessions/${encodeURIComponent(activeSession)}${
        query ? `?${query}` : ""
      }`;
      window.history.replaceState(null, "", nextUrl);
      await refreshSessionInfo(activeSession);
    }

    void claimSession();
    return () => {
      cancelled = true;
    };
  }, [applySessionPayload, initialSessionId, refreshSessionInfo]);

  const addEvent = useCallback((type: string, detail: string) => {
    const event = {
      type,
      detail,
      at: new Date().toLocaleTimeString(),
    };
    setEvents((current) => [event, ...current].slice(0, 18));
  }, []);

  const syncState = useCallback(
    async (body: Record<string, unknown>) => {
      const activeSessionId = sessionIdRef.current;
      if (!activeSessionId) {
        return;
      }
      await fetch("/api/calls", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, sessionId: activeSessionId }),
      }).catch(() => {
        addEvent("state-sync-failed", "Could not update MCP-visible state.");
      });
    },
    [addEvent],
  );

  const pushCallEvent = useCallback(
    async (eventType: string, detail: string, payload?: unknown) => {
      await syncState({
        action: "event",
        eventType,
        detail,
        payload:
          payload && typeof payload === "object"
            ? { ...(payload as Record<string, unknown>) }
            : undefined,
      });
    },
    [syncState],
  );

  async function connect(): Promise<WebSocket | null> {
    const activeSessionId = sessionIdRef.current;
    if (!activeSessionId) {
      setError("Open a valid call session link first.");
      return null;
    }

    if (connection === "connecting" || connection === "connected") {
      return wsRef.current;
    }

    setError(null);
    setConnection("connecting");
    addEvent("connect", "Requesting Vercel AI Gateway WebSocket config.");
    void pushCallEvent("connect_requested", "Browser requested realtime connection.");

    const response = await fetch("/api/realtime/connect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: activeSessionId }),
    });
    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as {
        error?: string;
        cause?: string;
      } | null;
      const message =
        payload?.cause ?? payload?.error ?? `Connect failed: ${response.status}`;
      setConnection("error");
      setError(message);
      addEvent("connect-error", message);
      void pushCallEvent("connect_error", message);
      return null;
    }

    const config = (await response.json()) as {
      url: string;
      protocols?: string[];
    };

    const ws = new WebSocket(config.url, config.protocols ?? []);
    wsRef.current = ws;

    return new Promise((resolve) => {
      ws.onopen = () => {
      const agentName = readCodingAgentName();
      setConnection("connected");
      const now = Date.now();
      setStartedAt(now);
      addEvent("websocket-open", "Realtime socket connected.");
      void pushCallEvent("connected", "Realtime WebSocket connected.");
      ws.send(
        JSON.stringify({
          type: "session-update",
          config: {
            voice: voiceName,
            inputAudioTranscription: {
              model: "gpt-4o-mini-transcribe",
            },
            outputAudioTranscription: {},
            turnDetection: { type: "server-vad" },
            instructions:
              `You are This Needs A Call, a concise voice conversation partner for coding work. There are three parties in this conversation: (1) the user, a developer who is speaking, planning features, and giving feedback; (2) you, the voice agent, who is only a conversational partner; and (3) ${agentName}, the coding agent that monitors this transcript and performs project work. You can reason conversationally, ask clarifying questions, describe workflow possibilities, and explain what ${agentName} should pick up. You do not have tools or workflows yourself, and you must not claim to execute code, inspect files, call MCP tools, deploy, or change the project. When the user asks for implementation, inspection, deployment, usage checks, workflow execution, or tool use, acknowledge briefly that ${agentName} should pick it up from the transcript and name the requested workflow in plain language. Do not say you lack access, do not ask the user to paste a separate prompt, and do not pretend to be ${agentName}. Speak naturally and keep responses short.`,
          },
        }),
      );
      void syncState({
        action: "start",
        contact: "This Needs A Call",
      });
      resolve(ws);
    };

    ws.onmessage = (message) => {
      handleRealtimeMessage(message.data);
    };

    ws.onerror = () => {
      setConnection("error");
      setError("Realtime WebSocket failed.");
      addEvent("websocket-error", "Browser reported a WebSocket error.");
      void pushCallEvent("websocket_error", "Browser reported a WebSocket error.");
      resolve(null);
    };

    ws.onclose = () => {
      setConnection("disconnected");
      setStartedAt(null);
      stopMic();
      addEvent("websocket-close", "Realtime socket closed.");
      void pushCallEvent("disconnected", "Realtime WebSocket closed.");
      void syncState({ action: "end", summary: "Realtime socket closed." });
    };
    });
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (
      !sessionReady ||
      !sessionId ||
      params.get("autostart") !== "1" ||
      autostartedRef.current
    ) {
      return;
    }

    autostartedRef.current = true;
    void connect();
  }, [connection, sessionId, sessionReady]);

  function disconnect() {
    stopMic();
    if (isCapturing) {
      void pushCallEvent("mic_stopped", "Microphone capture stopped.");
    }
    wsRef.current?.close();
    wsRef.current = null;
    setConnection("disconnected");
    setStartedAt(null);
  }

  async function selectCallSession(nextSessionId: string) {
    if (nextSessionId === sessionIdRef.current) {
      return;
    }

    disconnect();
    setSessionId(nextSessionId);
    sessionIdRef.current = nextSessionId;
    const params = new URLSearchParams(window.location.search);
    params.delete("autostart");
    params.delete("join");
    const query = params.toString();
    window.history.pushState(
      null,
      "",
      `/sessions/${encodeURIComponent(nextSessionId)}${query ? `?${query}` : ""}`,
    );
    await refreshSessionInfo(nextSessionId);

    const response = await fetch(
      `/api/calls?session=${encodeURIComponent(nextSessionId)}`,
    ).catch(() => null);
    if (!response?.ok) {
      return;
    }
    const payload = (await response.json().catch(() => null)) as {
      fullTranscript?: { transcript?: TranscriptEntry[] };
      voiceMessages?: VoiceMessage[];
    } | null;
    setTranscript(payload?.fullTranscript?.transcript ?? []);
    if (payload?.voiceMessages) {
      handleIncomingVoiceMessages(payload.voiceMessages);
    }
  }

  const isVoiceBusy = useCallback(
    () => activeResponseRef.current || playbackSourcesRef.current.size > 0,
    [],
  );

  const injectVoiceMessage = useCallback(
    (message: VoiceMessage) => {
      const ws = wsRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN || isVoiceBusy()) {
        return false;
      }
      if (!acquireVoiceMessageLock(message.id)) {
        return true;
      }

      ws.send(
        JSON.stringify({
          type: "conversation-item-create",
          item: {
            type: "text-message",
            role: "user",
            text:
              "Read this coding-agent update to the user conversationally using your normal voice. Keep it concise and natural; do not mention internal delivery mechanics.\n\n" +
              message.text,
          },
        }),
      );
      ws.send(JSON.stringify({ type: "response-create" }));
      activeResponseRef.current = true;
      addEvent("agent-message", message.text.slice(0, 140));
      void syncState({
        action: "mark_voice_messages",
        messageIds: [message.id],
      });
      return true;
    },
    [addEvent, isVoiceBusy, syncState],
  );

  const scheduleVoiceMessageDrain = useCallback((delayMs = 300) => {
    if (voiceMessageDrainTimerRef.current !== null) {
      return;
    }
    voiceMessageDrainTimerRef.current = window.setTimeout(() => {
      voiceMessageDrainTimerRef.current = null;
      drainVoiceMessageQueueRef.current();
    }, delayMs);
  }, []);

  const drainVoiceMessageQueue = useCallback(() => {
    if (pendingVoiceMessagesRef.current.length === 0) {
      return;
    }

    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN || isVoiceBusy()) {
      scheduleVoiceMessageDrain(500);
      return;
    }

    const [message, ...remaining] = pendingVoiceMessagesRef.current;
    pendingVoiceMessagesRef.current = remaining;
    const injected = injectVoiceMessage(message);
    if (!injected) {
      pendingVoiceMessagesRef.current = [
        message,
        ...pendingVoiceMessagesRef.current,
      ];
    }
    if (pendingVoiceMessagesRef.current.length > 0) {
      scheduleVoiceMessageDrain(injected ? 500 : 750);
    }
  }, [injectVoiceMessage, isVoiceBusy, scheduleVoiceMessageDrain]);

  useEffect(() => {
    drainVoiceMessageQueueRef.current = drainVoiceMessageQueue;
  }, [drainVoiceMessageQueue]);

  const handleIncomingVoiceMessages = useCallback(
    (messages: VoiceMessage[]) => {
      const actionable = messages.filter((message) => !message.read);

      if (actionable.length === 0) {
        return;
      }

      const queuedIds = new Set(
        pendingVoiceMessagesRef.current.map((message) => message.id),
      );
      for (const message of actionable) {
        if (!queuedIds.has(message.id)) {
          pendingVoiceMessagesRef.current.push(message);
          queuedIds.add(message.id);
        }
      }
      scheduleVoiceMessageDrain();
    },
    [scheduleVoiceMessageDrain],
  );

  useEffect(() => {
    let cancelled = false;

    async function loadVoiceMessages() {
      const activeSessionId = sessionIdRef.current;
      if (!activeSessionId) {
        return;
      }
      const response = await fetch(
        `/api/calls?session=${encodeURIComponent(activeSessionId)}`,
      ).catch(() => null);
      if (!response?.ok || cancelled) {
        return;
      }
      const payload = (await response.json().catch(() => null)) as {
        voiceMessages?: VoiceMessage[];
      } | null;
      if (!payload?.voiceMessages || cancelled) {
        return;
      }
      handleIncomingVoiceMessages(payload.voiceMessages);
    }

    void loadVoiceMessages();
    const interval = window.setInterval(() => {
      void loadVoiceMessages();
    }, 2000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [handleIncomingVoiceMessages]);

  async function toggleMic() {
    if (isCapturing) {
      stopMic();
      void pushCallEvent("mic_stopped", "Microphone capture stopped.");
      sendEvent({ type: "input-audio-commit" });
      sendEvent({ type: "response-create" });
      return;
    }

    if (connection !== "connected") {
      const connectedSocket = await connect();
      if (!connectedSocket) {
        return;
      }
    }

    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      setError("Connect realtime before starting the microphone.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      startMic(stream);
      setMicPermission("granted");
      addEvent("mic-start", "Microphone capture started.");
      void pushCallEvent("mic_started", "Microphone capture started.");
    } catch (micError) {
      setMicPermission("denied");
      const message =
        micError instanceof Error ? micError.message : String(micError);
      setError(message);
      addEvent("mic-error", message);
      void pushCallEvent("mic_error", message);
    }
  }

  function startMic(stream: MediaStream) {
    stopMic();

    const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
    const context = new AudioContextCtor();
    const source = context.createMediaStreamSource(stream);
    const analyser = context.createAnalyser();
    const processor = context.createScriptProcessor(4096, 1, 1);
    const levelData = new Uint8Array(analyser.frequencyBinCount);

    analyser.fftSize = 256;
    source.connect(analyser);
    source.connect(processor);
    processor.connect(context.destination);

    processor.onaudioprocess = (event) => {
      const ws = wsRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        return;
      }
      const samples = event.inputBuffer.getChannelData(0);
      interruptAssistantIfUserIsSpeaking(samples);
      const resampled = resample(samples, context.sampleRate, inputSampleRate);
      ws.send(
        JSON.stringify({
          type: "input-audio-append",
          audio: encodePcm16Base64(resampled),
        }),
      );
    };

    let active = true;
    const tick = () => {
      if (!active) {
        return;
      }
      analyser.getByteTimeDomainData(levelData);
      let sum = 0;
      for (const sample of levelData) {
        const normalized = (sample - 128) / 128;
        sum += normalized * normalized;
      }
      setMicLevel(Math.min(100, Math.round(Math.sqrt(sum / levelData.length) * 240)));
      window.requestAnimationFrame(tick);
    };
    tick();
    setIsCapturing(true);

    micCleanupRef.current = () => {
      active = false;
      processor.disconnect();
      source.disconnect();
      stream.getTracks().forEach((track) => track.stop());
      void context.close();
      setMicLevel(0);
      setIsCapturing(false);
    };
  }

  function stopMic() {
    micCleanupRef.current?.();
    micCleanupRef.current = null;
  }

  function sendEvent(event: Record<string, unknown>) {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      return;
    }
    ws.send(JSON.stringify(event));
  }

  function handleRealtimeMessage(data: unknown) {
    const text =
      typeof data === "string"
        ? data
        : data instanceof Blob
          ? null
          : new TextDecoder().decode(data as ArrayBuffer);

    if (!text) {
      return;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      addEvent("unparsed-message", text.slice(0, 120));
      return;
    }

    const realtimeEvents = Array.isArray(parsed) ? parsed : [parsed];
    for (const event of realtimeEvents) {
      if (!isRealtimeEvent(event)) {
        continue;
      }
      handleRealtimeEvent(event);
    }
  }

  function handleRealtimeEvent(event: Record<string, unknown>) {
    const type = String(event.type ?? "event");
    const detail = summarizeEvent(event);
    if (isRealtimeError(type) && isNoActiveResponseError(event, detail)) {
      activeResponseRef.current = false;
      addEvent("cancel-ignored", detail);
      return;
    }
    addEvent(type, detail);
    if (isImportantRealtimeEvent(type)) {
      void pushCallEvent(`realtime_${type}`, detail);
    }

    if (type === "audio-delta" && typeof event.delta === "string") {
      playPcm16(event.delta);
    }

    if (isResponseStarted(type)) {
      activeResponseRef.current = true;
    }

    if (isAssistantTranscriptDelta(type)) {
      const delta = transcriptText(event);
      if (!delta) {
        return;
      }
      assistantDraftRef.current += delta;
      const draftId = assistantDraftId(event);
      assistantDraftIdRef.current = draftId;
      upsertTranscript(draftId, "assistant", assistantDraftRef.current);
    }

    if (isAssistantTranscriptDone(type)) {
      const transcriptTextValue = transcriptText(event);
      if (!transcriptTextValue) {
        return;
      }
      assistantDraftRef.current = transcriptTextValue;
      const draftId = assistantDraftId(event);
      assistantDraftIdRef.current = draftId;
      upsertTranscript(draftId, "assistant", assistantDraftRef.current);
    }

    if (isUserTranscriptDone(type)) {
      const transcriptTextValue = transcriptText(event);
      if (!transcriptTextValue) {
        void pushCallEvent(
          "user_transcript_missing",
          JSON.stringify(event).slice(0, 500),
        );
        return;
      }
      userDraftRef.current = transcriptTextValue;
      const entry = createTranscriptEntry(
        `user-${String(event.itemId ?? "transcript")}`,
        "user",
        userDraftRef.current,
      );
      upsertTranscriptEntry(entry);
      void pushCallEvent(
        "user_transcript",
        userDraftRef.current.trim(),
        {
          kind: "transcript_entry",
          entry,
        },
      );
      void syncState({
        action: "utterance",
        role: "user",
        text: userDraftRef.current.trim(),
      });
      userDraftRef.current = "";
    }

    if (type === "response-done") {
      activeResponseRef.current = false;
      scheduleVoiceMessageDrain();
      if (assistantDraftRef.current.trim()) {
        const entry = createTranscriptEntry(
          assistantDraftIdRef.current ?? assistantDraftId(event),
          "assistant",
          assistantDraftRef.current,
        );
        upsertTranscriptEntry(entry);
        void pushCallEvent(
          "assistant_transcript",
          assistantDraftRef.current.trim(),
          {
            kind: "transcript_entry",
            entry,
          },
        );
        void syncState({
          action: "utterance",
          role: "assistant",
          text: assistantDraftRef.current.trim(),
        });
      }
      assistantDraftRef.current = "";
      assistantDraftIdRef.current = null;
    }

    if (isRealtimeError(type)) {
      const message = realtimeErrorMessage(event) ?? "Realtime error";
      activeResponseRef.current = false;
      setError(message);
    }
  }

  function upsertTranscript(id: string, role: TranscriptEntry["role"], text: string) {
    upsertTranscriptEntry(createTranscriptEntry(id, role, text));
  }

  function upsertTranscriptEntry(entry: TranscriptEntry) {
    setTranscript((entries) => {
      const next = entries.filter((current) => current.id !== entry.id);
      return [...next, entry];
    });
  }

  function playPcm16(base64Audio: string) {
    const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
    const context =
      playbackContextRef.current ?? new AudioContextCtor({ sampleRate: inputSampleRate });
    playbackContextRef.current = context;

    const bytes = Uint8Array.from(atob(base64Audio), (char) => char.charCodeAt(0));
    const samples = new Float32Array(bytes.length / 2);
    const view = new DataView(bytes.buffer);
    for (let index = 0; index < samples.length; index += 1) {
      samples[index] = view.getInt16(index * 2, true) / 32768;
    }

    const buffer = context.createBuffer(1, samples.length, inputSampleRate);
    buffer.getChannelData(0).set(samples);
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(context.destination);

    const startAt = Math.max(playbackTimeRef.current, context.currentTime);
    source.start(startAt);
    playbackSourcesRef.current.add(source);
    playbackTimeRef.current = startAt + buffer.duration;
    setIsPlaying(true);
    source.onended = () => {
      playbackSourcesRef.current.delete(source);
      if (context.currentTime >= playbackTimeRef.current - 0.05) {
        setIsPlaying(false);
        scheduleVoiceMessageDrain();
      }
    };
  }

  function interruptAssistantIfUserIsSpeaking(samples: Float32Array) {
    if (!isPlaying && playbackSourcesRef.current.size === 0) {
      return;
    }

    let sum = 0;
    for (const sample of samples) {
      sum += sample * sample;
    }
    const rms = Math.sqrt(sum / samples.length);
    const now = playbackContextRef.current?.currentTime ?? 0;

    if (rms < 0.025 || now - lastBargeInAtRef.current < 0.8) {
      return;
    }

    lastBargeInAtRef.current = now;
    stopAssistantPlayback();
    if (activeResponseRef.current) {
      sendEvent({ type: "response-cancel" });
    }
    void pushCallEvent(
      "barge_in",
      "Stopped assistant playback because local microphone input detected user speech.",
    );
  }

  function stopAssistantPlayback() {
    for (const source of playbackSourcesRef.current) {
      try {
        source.stop();
      } catch {
        // Already stopped sources are removed by their onended handlers.
      }
    }
    playbackSourcesRef.current.clear();
    playbackTimeRef.current = playbackContextRef.current?.currentTime ?? 0;
    setIsPlaying(false);
  }

  useEffect(() => {
    return () => {
      stopMic();
      wsRef.current?.close();
      void playbackContextRef.current?.close();
    };
  }, []);

  return (
    <main className="page">
      <div className="toolbar-shell">
        <section className="session-strip" aria-label="Call sessions">
          <div className="session-tabs" role="tablist" aria-label="Available call sessions">
            {sessions.length === 0 ? (
              <span className="session-empty">Open a call link to start.</span>
            ) : (
              sessions.map((session) => (
                <button
                  aria-selected={session.id === sessionId}
                  className="session-tab"
                  key={session.id}
                  onClick={() => void selectCallSession(session.id)}
                  role="tab"
                  type="button"
                >
                  <span>{session.contact}</span>
                  <small>{session.status}</small>
                </button>
              ))
            )}
          </div>
          {shareUrl ? (
            <details className="share-panel">
              <summary>Share</summary>
              <div>
                <input readOnly value={shareUrl} aria-label="Session magic link" />
                <img
                  alt="Session magic link QR code"
                  src={`/api/call-session/qr?url=${encodeURIComponent(shareUrl)}`}
                />
              </div>
            </details>
          ) : null}
        </section>

        <header className="toolbar">
          <div className="brand">
            <span className={`status-dot ${connection}`} aria-hidden="true" />
            <strong>This Needs A Call</strong>
            <span>{elapsed}</span>
          </div>

          <div className="call-state" aria-label="Call status" aria-live="polite">
            <span>{callStateText(connection, isCapturing, isPlaying)}</span>
            <div className="mini-meter" aria-label="Microphone input level">
              <span style={{ opacity: micLevel > 0 ? 1 : 0, width: `${micLevel}%` }} />
            </div>
          </div>

          <div className="toolbar-actions">
            <button
              className="control primary"
              onClick={toggleMic}
              type="button"
            >
              {isCapturing ? "Stop" : "Start"}
            </button>
            {connection === "connected" ? (
              <button className="control" onClick={disconnect} type="button">
                End
              </button>
            ) : null}
          </div>
        </header>

        {error ? <p className="error-text compact-error">{error}</p> : null}

        <section className="panel transcript-panel">
          <div className="panel-heading">
            <h2>Transcript</h2>
            <span>{transcript.length}</span>
          </div>
          {transcript.length === 0 ? (
            <p className="empty">No transcript.</p>
          ) : (
            <div className="feed">
              {transcript.map((entry) => (
                <article className={`feed-row ${entry.role}`} key={entry.id}>
                  <span>{entry.role}</span>
                  <p>{entry.text}</p>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

function isRealtimeEvent(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && "type" in value;
}

function createTranscriptEntry(
  id: string,
  role: TranscriptEntry["role"],
  text: string,
): TranscriptEntry {
  return {
    id,
    role,
    text,
    createdAt: new Date().toISOString(),
  };
}

function callStateText(
  connection: ConnectionState,
  isCapturing: boolean,
  isPlaying: boolean,
): string {
  if (isCapturing) {
    return isPlaying ? "Listening while response plays" : "Listening";
  }
  if (isPlaying) {
    return "Playing response";
  }
  if (connection === "connected") {
    return "Connected";
  }
  if (connection === "connecting") {
    return "Connecting";
  }
  if (connection === "error") {
    return "Connection error";
  }
  return "Ready";
}

function assistantDraftId(event: Record<string, unknown>): string {
  const candidate =
    stringValue(event.responseId) ??
    stringValue(event.itemId) ??
    stringValue(event.outputIndex) ??
    stringValue(event.event_id);

  return candidate
    ? `assistant-${candidate}`
    : `assistant-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function readCodingAgentName(): string {
  if (typeof window === "undefined") {
    return defaultCodingAgentName;
  }

  const params = new URLSearchParams(window.location.search);
  const queryAgent = params.get("agent")?.trim();
  const storedAgent = window.localStorage.getItem("codingAgentName")?.trim();
  const agentName = queryAgent || storedAgent || defaultCodingAgentName;
  window.localStorage.setItem("codingAgentName", agentName);
  return agentName;
}

function acquireVoiceMessageLock(messageId: string): boolean {
  if (typeof window === "undefined") {
    return true;
  }

  const key = `thisNeedsACallMessage:${messageId}`;
  const existing = Number(window.localStorage.getItem(key) ?? "0");
  const now = Date.now();
  if (Number.isFinite(existing) && now - existing < 10 * 60 * 1000) {
    return false;
  }

  window.localStorage.setItem(key, String(now));
  return true;
}

function summarizeEvent(event: Record<string, unknown>): string {
  const transcriptTextValue = transcriptText(event);
  if (transcriptTextValue) {
    return transcriptTextValue.slice(0, 180);
  }
  if (typeof event.message === "string") {
    return event.message;
  }
  if (typeof event.error === "string") {
    return event.error;
  }
  const errorMessage = realtimeErrorMessage(event);
  if (errorMessage) {
    return errorMessage;
  }
  return JSON.stringify(event).slice(0, 180);
}

function isImportantRealtimeEvent(type: string): boolean {
  return [
    "session-created",
    "session-updated",
    "response-created",
    "response-started",
    "response-done",
    "input-transcription-completed",
    "input-audio-transcription-done",
    "input_audio_transcription.completed",
    "conversation.item.input_audio_transcription.completed",
    "audio-transcript-done",
    "response.audio_transcript.done",
    "response.output_audio_transcript.done",
    "error",
  ].includes(type);
}

function isResponseStarted(type: string): boolean {
  return [
    "response-created",
    "response-started",
    "response.created",
    "response.started",
  ].includes(type);
}

function isRealtimeError(type: string): boolean {
  return type === "error" || type === "realtime_error";
}

function isNoActiveResponseError(
  event: Record<string, unknown>,
  fallback: string,
): boolean {
  const message = realtimeErrorMessage(event) ?? fallback;
  return message.toLowerCase().includes("no active response found");
}

function realtimeErrorMessage(event: Record<string, unknown>): string | null {
  if (typeof event.message === "string") {
    return event.message;
  }
  if (typeof event.error === "string") {
    return event.error;
  }
  if (event.error && typeof event.error === "object") {
    const error = event.error as Record<string, unknown>;
    if (typeof error.message === "string") {
      return error.message;
    }
  }
  return null;
}

function isAssistantTranscriptDelta(type: string): boolean {
  return [
    "audio-transcript-delta",
    "response.audio_transcript.delta",
    "response.output_audio_transcript.delta",
  ].includes(type);
}

function isAssistantTranscriptDone(type: string): boolean {
  return [
    "audio-transcript-done",
    "response.audio_transcript.done",
    "response.output_audio_transcript.done",
  ].includes(type);
}

function isUserTranscriptDone(type: string): boolean {
  return [
    "input-transcription-completed",
    "input-audio-transcription-done",
    "input_audio_transcription.completed",
    "conversation.item.input_audio_transcription.completed",
  ].includes(type);
}

function transcriptText(event: Record<string, unknown>): string | null {
  return findTranscriptText(event);
}

function findTranscriptText(value: unknown, depth = 0): string | null {
  if (depth > 4 || value === null || value === undefined) {
    return null;
  }

  if (typeof value === "string") {
    return value.trim() ? value : null;
  }

  if (Array.isArray(value)) {
    for (const entry of value) {
      const found = findTranscriptText(entry, depth + 1);
      if (found) {
        return found;
      }
    }
    return null;
  }

  if (typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  for (const key of ["transcript", "text", "delta"]) {
    const found = findTranscriptText(record[key], depth + 1);
    if (found) {
      return found;
    }
  }

  for (const key of ["item", "content", "output", "response"]) {
    const found = findTranscriptText(record[key], depth + 1);
    if (found) {
      return found;
    }
  }

  return null;
}

function resample(
  input: Float32Array,
  sourceRate: number,
  targetRate: number,
): Float32Array {
  if (sourceRate === targetRate) {
    return new Float32Array(input);
  }

  const ratio = sourceRate / targetRate;
  const outputLength = Math.floor(input.length / ratio);
  const output = new Float32Array(outputLength);

  for (let index = 0; index < outputLength; index += 1) {
    const sourceIndex = index * ratio;
    const lower = Math.floor(sourceIndex);
    const upper = Math.min(lower + 1, input.length - 1);
    const weight = sourceIndex - lower;
    output[index] = input[lower] * (1 - weight) + input[upper] * weight;
  }

  return output;
}

function encodePcm16Base64(samples: Float32Array): string {
  const buffer = new ArrayBuffer(samples.length * 2);
  const view = new DataView(buffer);

  for (let index = 0; index < samples.length; index += 1) {
    const sample = Math.max(-1, Math.min(1, samples[index]));
    view.setInt16(index * 2, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
  }

  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}
