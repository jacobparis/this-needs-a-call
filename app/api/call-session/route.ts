import { NextRequest, NextResponse } from "next/server";
import {
  createCallSessionAccess,
  getCallState,
  listCallSessions,
  setActiveCallSession,
} from "@/app/lib/calls";
import {
  formatSessionToken,
  requireSessionGrant,
  verifiedSessionIds,
  writeSessionGrants,
} from "@/app/lib/session-cookie";
import { withHydratedCallStore } from "@/app/lib/call-storage";
import { authorizeBearerSecret } from "@/app/lib/server-auth";

type StartSessionBody = {
  reset?: boolean;
  contact?: string;
  scenario?: string;
  openingLine?: string;
  agent?: string;
};

export async function POST(request: Request) {
  const auth = authorizeSessionCreation(request);
  if (auth) {
    return auth;
  }

  return withHydratedCallStore(
    async () => {
      const body = (await request.json().catch(() => ({}))) as StartSessionBody;
      const { access, call } = createCallSessionAccess({
        contact: body.contact ?? "This Needs A Call",
        scenario: body.scenario ?? "realtime:core",
        openingLine:
          body.openingLine ??
          "Call session created by Codex. The page should connect the realtime voice agent automatically.",
      });
      const url = new URL(request.url);
      const appUrl = new URL("/", url.origin);
      appUrl.searchParams.set("join", formatSessionToken(access));
      appUrl.searchParams.set("autostart", "1");
      if (body.agent?.trim()) {
        appUrl.searchParams.set("agent", body.agent.trim());
      }

      return NextResponse.json({
        call,
        url: appUrl.toString(),
        magicLink: appUrl.toString(),
        sessionId: call.id,
        monitor: {
          expectedAutomationId: "poll-call-mcp-updates",
          stopCondition: "Delete the heartbeat when get_call_state returns ended or idle.",
        },
      });
    },
    { persist: true },
  );
}

function authorizeSessionCreation(request: Request): Response | null {
  return authorizeBearerSecret({
    request,
    secret: process.env.CALL_SESSION_CREATE_SECRET ?? process.env.MCP_SHARED_SECRET,
    missingMessage:
      "CALL_SESSION_CREATE_SECRET or MCP_SHARED_SECRET is required in production.",
  });
}

export async function GET(request: NextRequest) {
  return withHydratedCallStore(async () => {
    const url = new URL(request.url);
    const sessionId = url.searchParams.get("session");
    const grant = requireSessionGrant(request, sessionId);
    if (grant) {
      setActiveCallSession(grant.id);
    }

    const sessions = listCallSessions(verifiedSessionIds(request));
    const activeSession = grant?.id ?? sessions[0]?.id ?? null;
    const activeGrant = activeSession
      ? requireSessionGrant(request, activeSession)
      : null;
    const shareUrl = activeGrant
      ? makeAppUrl(url.origin, activeGrant, false).toString()
      : null;

    return NextResponse.json({
      call: activeGrant ? getCallState() : null,
      sessions,
      activeSession,
      shareUrl,
      startUrl: `${url.origin}/api/call-session`,
    });
  });
}

function makeAppUrl(origin: string, access: { id: string; secret: string }, autostart: boolean) {
  const appUrl = new URL("/", origin);
  appUrl.searchParams.set("join", formatSessionToken(access));
  if (autostart) {
    appUrl.searchParams.set("autostart", "1");
  }
  return appUrl;
}
