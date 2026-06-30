import { createHash, timingSafeEqual } from "node:crypto";

export function authorizeBearerSecret(input: {
  request: Request;
  secret: string | undefined;
  missingMessage: string;
}): Response | null {
  if (!input.secret && isProductionRuntime()) {
    return Response.json({ error: input.missingMessage }, { status: 503 });
  }

  if (!input.secret) {
    return null;
  }

  const token = bearerToken(input.request);
  if (!token || !secretsEqual(token, input.secret)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  return null;
}

function bearerToken(request: Request): string | null {
  const authorization = request.headers.get("authorization") ?? "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

function secretsEqual(left: string, right: string): boolean {
  const leftHash = createHash("sha256").update(left).digest();
  const rightHash = createHash("sha256").update(right).digest();
  return timingSafeEqual(leftHash, rightHash);
}

function isProductionRuntime(): boolean {
  return (
    process.env.NODE_ENV === "production" ||
    process.env.VERCEL_ENV === "production"
  );
}
