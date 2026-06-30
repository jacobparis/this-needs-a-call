import { NextRequest, NextResponse } from "next/server";
import {
  getCallState,
  listCallSessions,
  setActiveCallSession,
  verifyCallSessionAccess,
} from "@/app/lib/calls";
import {
  parseSessionToken,
  readSessionGrants,
  verifiedSessionIds,
  writeSessionGrants,
} from "@/app/lib/session-cookie";
import { withHydratedCallStore } from "@/app/lib/call-storage";

type ClaimBody = {
  token?: string;
};

export async function POST(request: NextRequest) {
  return withHydratedCallStore(async () => {
    const body = (await request.json().catch(() => ({}))) as ClaimBody;
    const access = parseSessionToken(body.token ?? null);

    if (!access || !verifyCallSessionAccess(access)) {
      return NextResponse.json({ error: "Invalid session link." }, { status: 403 });
    }

    setActiveCallSession(access.id);
    const grants = [...readSessionGrants(request), access];
    const response = NextResponse.json({
      call: getCallState(),
      sessions: listCallSessions([
        ...new Set([...verifiedSessionIds(request), access.id]),
      ]),
      activeSession: access.id,
    });
    writeSessionGrants(response, grants);
    return response;
  });
}
