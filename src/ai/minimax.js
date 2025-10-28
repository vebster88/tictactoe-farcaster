import { checkWinner } from "../game/rules.js";

function key(board, turn) {
  return board.map(v => v ?? "_").join("") + "|" + turn;
}

function scoreTerminal(board, bot, depth) {
  const res = checkWinner(board);
  if (!res) return null;
  if (res.winner === bot) return 10 - depth;
  if (res.winner && res.winner !== bot) return depth - 10;
  if (res.draw) return 0;
  return null;
}

function emptyCells(board) {
  const out = [];
  for (let i = 0; i < 9; i++) if (board[i] === null) out.push(i);
  return out;
}

function tryOneMoveWin(board, turn) {
  const empties = emptyCells(board);
  for (const idx of empties) {
    board[idx] = turn;
    const win = checkWinner(board);
    board[idx] = null;
    if (win?.winner === turn) return idx;
  }
  return null;
}

/**
 * bestMoveMinimax
 * @param {Array} board - массив из 9 ячеек (X|O|null)
 * @param {string} bot - символ бота ("O" по умолчанию)
 * @param {boolean} alphaBeta - включить альфа-бета отсечение
 * @param {string} nextTurn - чей ход сейчас (ОБЯЗАТЕЛЬНО передавать state.next)
 */
export function bestMoveMinimax(board, bot = "O", alphaBeta = true, nextTurn = "O") {
  const memo = new Map();
  const center = 4;

  // Эвристика: мгновенная победа/блок на корневом ходе
  const winNow = tryOneMoveWin([...board], nextTurn);
  if (winNow !== null) return winNow;
  const opponent = nextTurn === "X" ? "O" : "X";
  const blockNow = tryOneMoveWin([...board], opponent);
  if (blockNow !== null) return blockNow;
  if (board[center] === null) return center; // центр в приоритете

  function minimax(curr, turn, depth, alpha, beta) {
    const term = scoreTerminal(curr, bot, depth);
    if (term !== null) return { score: term, move: null };

    const k = key(curr, turn);
    if (memo.has(k)) return memo.get(k);

    const empties = emptyCells(curr);
    let best = { score: turn === bot ? -Infinity : Infinity, move: empties[0] ?? null };

    for (const idx of empties) {
      curr[idx] = turn;
      const next = turn === "X" ? "O" : "X";
      const res = minimax(curr, next, depth + 1, alpha, beta);
      curr[idx] = null;

      if (turn === bot) {
        if (res.score > best.score) best = { score: res.score, move: idx };
        if (alphaBeta) { alpha = Math.max(alpha, res.score); if (beta <= alpha) break; }
      } else {
        if (res.score < best.score) best = { score: res.score, move: idx };
        if (alphaBeta) { beta = Math.min(beta, res.score); if (beta <= alpha) break; }
      }
    }

    memo.set(k, best);
    return best;
  }

  return minimax([...board], nextTurn, 0, -Infinity, Infinity).move ?? null;
}
