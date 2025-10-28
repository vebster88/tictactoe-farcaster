import { v4 as uuid } from "uuid";
import { publishInvite } from "./client.js";

export function buildInvitePayload(session, opts = {}) {
  const matchId = opts.matchId || uuid();
  const firstMove = opts.firstMove || "random"; // "X" | "O" | "random"
  const visibility = opts.visibility || "public"; // "public" | "private"
  const expiresAt = opts.expiresAt || new Date(Date.now() + 60 * 60 * 1000).toISOString();

  return {
    schemaVersion: "1.0.0",
    type: "tictactoe/invite",
    matchId,
    fromFid: session?.fid ?? null,
    rules: { firstMove },
    visibility,
    expiresAt
  };
}

export async function sendInvite(session, opts = {}) {
  const payload = buildInvitePayload(session, opts);
  const res = await publishInvite(payload);
  return { payload, res };
}
