const LINES = [
  [0,1,2],[3,4,5],[6,7,8], // rows
  [0,3,6],[1,4,7],[2,5,8], // cols
  [0,4,8],[2,4,6]          // diagonals
];

export function isCellEmpty(board, idx) {
  return board[idx] === null;
}
export function validateMove(state, idx) {
  if (state.finished) return { ok:false, reason:"finished" };
  if (idx < 0 || idx > 8) return { ok:false, reason:"out_of_bounds" };
  if (!isCellEmpty(state.board, idx)) return { ok:false, reason:"occupied" };
  return { ok:true };
}
export function checkWinner(board) {
  for (const [a,b,c] of LINES) {
    if (board[a] && board[a] === board[b] && board[a] === board[c]) {
      return { winner: board[a], line:[a,b,c] };
    }
  }
  if (board.every(v => v !== null)) return { winner: null, line: null, draw:true };
  return null;
}
export function getWinningLines() {
  return LINES.slice();
}
