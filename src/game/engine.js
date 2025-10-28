import { cloneState } from "./state.js";
import { validateMove, checkWinner } from "./rules.js";

export function applyMove(state, idx) {
  const result = validateMove(state, idx);
  if (!result.ok) return { ok:false, reason: result.reason, state };

  const nextState = cloneState(state);
  nextState.board[idx] = state.next;
  nextState.turn = state.turn + 1;

  const outcome = checkWinner(nextState.board);
  if (outcome?.winner) {
    nextState.winner = outcome.winner;
    nextState.winLine = outcome.line;
    nextState.finished = true;
  } else if (outcome?.draw) {
    nextState.finished = true;
  } else {
    nextState.next = state.next === "X" ? "O" : "X";
  }
  return { ok:true, state: nextState };
}
