import "server-only";

import { createHash, randomBytes } from "node:crypto";

export function generateBookingToken() {
  const token = randomBytes(32).toString("base64url");
  return { token, tokenHash: hashBookingToken(token) };
}

export function hashBookingToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}
