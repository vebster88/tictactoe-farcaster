export function createInitialState() {
  return {
    board: Array(9).fill(null), // индексы 0..8
    next: "X",
    turn: 0,
    winner: null, // "X"|"O"|null
    winLine: null, // [a,b,c] или null
    finished: false
  };
}
export function cloneState(state) {
  return JSON.parse(JSON.stringify(state));
}
