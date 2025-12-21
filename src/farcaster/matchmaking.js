import { v4 as uuid } from "uuid";
import { publishInvite, getVirtualFidFromAddress } from "./client.js";
import { createMatch } from "./match-api.js";

export function buildInvitePayload(session, opts = {}) {
  const matchId = opts.matchId || uuid();
  const firstMove = opts.firstMove || "random"; // "X" | "O" | "random"
  const visibility = opts.visibility || "public"; // "public" | "private"
  const expiresAt = opts.expiresAt || new Date(Date.now() + 60 * 60 * 1000).toISOString();

  return {
    schemaVersion: "1.0.0",
    type: "tictactoe/invite",
    matchId,
    fromFid: session?.farcaster?.fid ?? session?.fid ?? null,
    rules: { firstMove },
    visibility,
    expiresAt
  };
}


export async function sendInvite(session, opts = {}) {
  const payload = buildInvitePayload(session, opts);
  
  // Create match in backend API (только один раз)
  let matchCreated = false;
  try {
    // Получаем FID из Farcaster профиля или создаем виртуальный FID из адреса кошелька
    let player1Fid = session?.farcaster?.fid || session?.fid;
    
    // Если нет FID, но есть адрес кошелька, создаем виртуальный FID
    if (!player1Fid && session?.address) {
      player1Fid = getVirtualFidFromAddress(session.address);
    }
    
    if (player1Fid) {
      await createMatch({
        matchId: payload.matchId,
        player1Fid: player1Fid,
        rules: payload.rules
      });
      matchCreated = true;
    }
  } catch (error) {
    // If match creation fails due to limit, throw error instead of continuing
    if (error.message?.includes("2 active matches")) {
      throw error;
    }
    // Если матч уже существует, это не ошибка
    if (error.message?.includes("already exists")) {
      matchCreated = true; // Матч уже создан, считаем что все ок
      console.log("Match already exists, continuing...");
    } else {
      // Continue even if match creation fails for other reasons - invite can still be published
    console.warn("Failed to create match in API:", error);
  }
  }

  // Publish invite to Farcaster (только если матч создан или уже существует)
  // Для приватного матча publishInvite вызывается отдельно с кастомным текстом
  let res = null;
  if (!opts.skipPublish) {
    res = await publishInvite(payload);
  }
  
  return { payload, res, matchCreated };
}
