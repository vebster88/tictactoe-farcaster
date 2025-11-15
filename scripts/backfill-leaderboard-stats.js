#!/usr/bin/env node
import process from "node:process";
import { performance } from "node:perf_hooks";

import {
  getAllFinishedMatches,
  recordLeaderboardOutcomeForMatch
} from "../lib/matches/kv-helper.js";

const LEADERBOARD_KEY = "leaderboard_stats";

async function resetLeaderboardStats() {
  const hasKVEnv = process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN;
  if (!hasKVEnv) {
    console.warn(
      "[backfill] KV_REST_API_URL / KV_REST_API_TOKEN not set, skip reset (memory fallback will reset automatically)"
    );
    return;
  }

  const { kv } = await import("@vercel/kv");
  await kv.del(LEADERBOARD_KEY);
  console.log(`[backfill] Cleared existing leaderboard key "${LEADERBOARD_KEY}"`);
}

async function backfillLeaderboard({ reset = false, dryRun = false } = {}) {
  const start = performance.now();
  if (reset) {
    await resetLeaderboardStats();
  }

  const matches = await getAllFinishedMatches();
  console.log(`[backfill] Loaded ${matches.length} finished matches`);

  let updated = 0;
  for (const match of matches) {
    if (dryRun) {
      console.log(
        `[backfill] Would record outcome for match ${match.matchId} (${match.player1Fid} vs ${match.player2Fid})`
      );
      continue;
    }
    await recordLeaderboardOutcomeForMatch(match);
    updated += 1;
  }

  const durationMs = Math.round(performance.now() - start);
  console.log(
    `[backfill] Completed${dryRun ? " (dry-run)" : ""}: processed ${matches.length} matches, updated ${updated} entries in ${durationMs}ms`
  );
}

const args = new Set(process.argv.slice(2));
const reset = args.has("--reset");
const dryRun = args.has("--dry-run");

backfillLeaderboard({ reset, dryRun })
  .then(() => {
    if (dryRun) {
      console.log('[backfill] Dry run finished. Re-run without "--dry-run" to apply changes.');
    }
    process.exit(0);
  })
  .catch((error) => {
    console.error("[backfill] Failed:", error);
    process.exit(1);
  });

