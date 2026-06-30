import type { NextRequest, NextResponse } from "next/server";
import {
  type CallSessionAccess,
  verifyCallSessionAccess,
} from "@/app/lib/calls";

export const callSessionsCookieName = "this_needs_a_call_sessions";

const maxAgeSeconds = 60 * 60 * 24 * 14;

export function parseSessionToken(token: string | null): CallSessionAccess | null {
  if (!token) {
    return null;
  }

  const [id, secret] = token.split(".");
  if (!safeTokenPart(id) || !safeTokenPart(secret)) {
    return null;
  }

  return { id, secret };
}

export function formatSessionToken(access: CallSessionAccess): string {
  return `${access.id}.${access.secret}`;
}

export function readSessionGrants(request: NextRequest): CallSessionAccess[] {
  const raw = request.cookies.get(callSessionsCookieName)?.value;
  if (!raw) {
    return [];
  }

  try {
    const json = Buffer.from(raw, "base64url").toString("utf8");
    const parsed = JSON.parse(json) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter(isSessionAccess).slice(0, 12);
  } catch {
    return [];
  }
}

export function verifiedSessionIds(request: NextRequest): string[] {
  return readSessionGrants(request)
    .filter(verifyCallSessionAccess)
    .map((grant) => grant.id);
}

export function requireSessionGrant(
  request: NextRequest,
  requestedSessionId?: string | null,
): CallSessionAccess | null {
  const grants = readSessionGrants(request).filter(verifyCallSessionAccess);
  if (grants.length === 0) {
    return null;
  }

  const requested = requestedSessionId?.trim();
  if (!requested) {
    return grants[0];
  }

  return grants.find((grant) => grant.id === requested) ?? null;
}

export function writeSessionGrants(
  response: NextResponse,
  grants: CallSessionAccess[],
): void {
  const unique = new Map<string, CallSessionAccess>();
  for (const grant of grants) {
    if (verifyCallSessionAccess(grant)) {
      unique.set(grant.id, grant);
    }
  }

  const payload = Buffer.from(
    JSON.stringify([...unique.values()].slice(-12)),
    "utf8",
  ).toString("base64url");
  response.cookies.set(callSessionsCookieName, payload, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: maxAgeSeconds,
  });
}

function isSessionAccess(value: unknown): value is CallSessionAccess {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as Partial<CallSessionAccess>;
  return safeTokenPart(candidate.id) && safeTokenPart(candidate.secret);
}

function safeTokenPart(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{8,160}$/.test(value);
}
