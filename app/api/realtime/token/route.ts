import { gateway } from "@ai-sdk/gateway";
import { NextRequest, NextResponse } from "next/server";
import { setActiveCallSession } from "@/app/lib/calls";
import { requireSessionGrant } from "@/app/lib/session-cookie";
import { withHydratedCallStore } from "@/app/lib/call-storage";

export async function POST(request: NextRequest) {
  return withHydratedCallStore(async () => {
    const body = (await request.json().catch(() => ({}))) as {
      sessionId?: string;
    };
    const grant = requireSessionGrant(request, body.sessionId);
    if (!grant || !setActiveCallSession(grant.id)) {
      return NextResponse.json({ error: "Session access required." }, { status: 403 });
    }

    try {
      const { token, url } = await gateway.experimental_realtime.getToken({
        model: "openai/gpt-realtime-2",
      });

      return NextResponse.json({ token, url, tools: [] });
    } catch (error) {
      return NextResponse.json(
        {
          error: "Unable to mint a realtime client token.",
          mode: "realtime_unavailable",
          detail:
            "On Vercel this should authenticate with project OIDC automatically. In local development, run `vercel link` and `vercel env pull` so VERCEL_OIDC_TOKEN is available.",
          cause: error instanceof Error ? error.message : String(error),
        },
        { status: 503 },
      );
    }
  });
}
