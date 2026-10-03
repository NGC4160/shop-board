import { timingSafeEqual } from "node:crypto";

export const PARTS_WRITE_TOKEN_ENV = "PARTS_WRITE_TOKEN";

export function partsWriteToken(): string {
  return process.env.PARTS_WRITE_TOKEN?.trim() ?? "";
}

export function isPartsWriteConfigured(): boolean {
  return Boolean(partsWriteToken());
}

export function readBearerToken(request: Request): string {
  const header = request.headers.get("authorization") ?? "";
  if (header.length >= 7 && header.slice(0, 7).toLowerCase() === "bearer ") {
    return header.slice(7).trim();
  }
  return "";
}

function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  if (a.length === 0 || a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** True only when PARTS_WRITE_TOKEN is set and the request Bearer token matches. */
export function authorizePartsWrite(request: Request): boolean {
  const expected = partsWriteToken();
  if (!expected) return false;
  return safeEqual(readBearerToken(request), expected);
}
