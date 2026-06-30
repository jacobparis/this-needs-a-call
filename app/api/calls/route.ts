import {
  addCallEvent,
  addChannelMessage,
  addUtterance,
  endCall,
  getChannelMessages,
  getCallEvents,
  getCallState,
  getCallSummary,
  getFullTranscript,
  markEventsDelivered,
  markChannelMessages,
  recordGrillTurn,
  resetCall,
  setActiveCallSession,
  setGrillMode,
  setMute,
  startCall,
} from "@/app/lib/calls";
import { NextRequest, NextResponse } from "next/server";
import { requireSessionGrant } from "@/app/lib/session-cookie";
import { withHydratedCallStore } from "@/app/lib/call-storage";

export async function GET(request: NextRequest) {
  return withHydratedCallStore(async () => {
    const url = new URL(request.url);
    const grant = requireSessionGrant(request, url.searchParams.get("session"));
    if (!grant || !setActiveCallSession(grant.id)) {
      return NextResponse.json({ error: "Session access required." }, { status: 403 });
    }

    return NextResponse.json({
      call: getCallState(),
      events: getCallEvents({ includeDelivered: true, limit: 50 }),
      summary: getCallSummary(),
      fullTranscript: getFullTranscript(),
      channelMessages: getChannelMessages({ includeRead: true, limit: 100 }),
    });
  });
}

export async function POST(request: NextRequest) {
  return withHydratedCallStore(
    async () => {
      const body = (await request.json().catch(() => ({}))) as {
        action?: string;
        contact?: string;
        scenario?: string;
        openingLine?: string;
        text?: string;
        role?: "user" | "assistant" | "system";
        summary?: string;
        muted?: boolean;
        eventType?: string;
        detail?: string;
        payload?: unknown;
        eventIds?: string[];
        messageIds?: string[];
        channelId?: string;
        sessionId?: string;
        priority?: string;
        active?: boolean;
        scope?: string;
        mode?: string;
        userTurn?: string;
      };
      const grant = requireSessionGrant(request, body.sessionId);
      if (!grant || !setActiveCallSession(grant.id)) {
        return NextResponse.json({ error: "Session access required." }, { status: 403 });
      }

      switch (body.action) {
        case "start":
          return NextResponse.json(
            startCall({
              id: grant.id,
              contact: body.contact,
              scenario: body.scenario,
              openingLine: body.openingLine,
            }),
          );
        case "utterance":
          return NextResponse.json(
            addUtterance({
              role: body.role,
              text: body.text ?? "",
            }),
          );
        case "end":
          return NextResponse.json(endCall(body.summary));
        case "mute":
          return NextResponse.json(setMute(Boolean(body.muted)));
        case "grill_mode":
          return NextResponse.json(
            setGrillMode({
              active: Boolean(body.active),
              scope: body.scope,
              mode: body.mode,
            }),
          );
        case "grill_turn":
          return NextResponse.json(recordGrillTurn({ userTurn: body.userTurn ?? "" }));
        case "say_text":
          return NextResponse.json(
            addChannelMessage({
              channelId: body.channelId,
              text: body.text,
              priority: body.priority,
            }),
          );
        case "mark_channel_messages":
          return NextResponse.json(
            markChannelMessages({
              messageIds: body.messageIds,
              read: true,
              spoken: true,
            }),
          );
        case "reset":
          return NextResponse.json(resetCall());
        case "event":
          return NextResponse.json(
            addCallEvent({
              type: body.eventType ?? "event",
              detail: body.detail ?? "",
              payload: body.payload,
            }),
          );
        case "mark_delivered":
          return NextResponse.json(markEventsDelivered(body.eventIds));
        default:
          return NextResponse.json(
            {
              error: "Unknown action",
              allowedActions: [
                "start",
                "utterance",
                "end",
                "mute",
                "grill_mode",
                "grill_turn",
                "say_text",
                "mark_channel_messages",
                "reset",
                "event",
                "mark_delivered",
              ],
            },
            { status: 400 },
          );
      }
    },
    { persist: true },
  );
}
