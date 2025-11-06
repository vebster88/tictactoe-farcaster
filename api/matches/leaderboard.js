import { getAllFinishedMatches } from "../../lib/matches/kv-helper.js";
import { MATCH_STATUS } from "../../lib/matches/schema.js";

export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    console.log(`[leaderboard] Getting leaderboard data`);
    
    // Получаем finished матчи для построения leaderboard
    // Для MVP собираем статистику из матчей всех игроков, которые есть в системе
    const finishedMatches = await getAllFinishedMatches();
    
    // Собираем статистику по игрокам
    const stats = new Map(); // fid -> { wins: 0, draws: 0, losses: 0 }
    
    for (const match of finishedMatches) {
      // Включаем все PVP матчи (с обоими игроками), включая тестовые
      if (!match.gameState?.finished || match.status !== MATCH_STATUS.FINISHED) continue;
      
      const player1Fid = match.player1Fid;
      const player2Fid = match.player2Fid;
      
      // Пропускаем матчи без второго игрока (не PVP)
      if (!player1Fid || !player2Fid) continue;
      
      const winner = match.gameState.winner;
      const player1Symbol = match.player1Symbol;
      const player2Symbol = match.player2Symbol;
      
      // Инициализируем статистику для игроков
      if (!stats.has(player1Fid)) {
        stats.set(player1Fid, { fid: player1Fid, wins: 0, draws: 0, losses: 0 });
      }
      if (!stats.has(player2Fid)) {
        stats.set(player2Fid, { fid: player2Fid, wins: 0, draws: 0, losses: 0 });
      }
      
      const p1Stats = stats.get(player1Fid);
      const p2Stats = stats.get(player2Fid);
      
      if (!winner) {
        // Ничья
        p1Stats.draws++;
        p2Stats.draws++;
      } else {
        const p1Won = (player1Symbol === winner);
        if (p1Won) {
          p1Stats.wins++;
          p2Stats.losses++;
        } else {
          p2Stats.wins++;
          p1Stats.losses++;
        }
      }
    }
    
    // Преобразуем в массив и сортируем по победам
    const leaderboard = Array.from(stats.values()).sort((a, b) => {
      // Сортируем сначала по победам, потом по ничьим
      if (b.wins !== a.wins) return b.wins - a.wins;
      return b.draws - a.draws;
    });
    
    console.log(`[leaderboard] Found ${leaderboard.length} players with stats`);
    
    return res.status(200).json({ leaderboard });
  } catch (error) {
    console.error("Error getting leaderboard:", error);
    return res.status(500).json({ error: error.message || "Internal server error" });
  }
}

