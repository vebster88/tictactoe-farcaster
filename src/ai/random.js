export function pickRandomMove(board) {
  const empty = board.map((v,i)=>v===null?i:null).filter(i=>i!==null);
  if (empty.length === 0) return null;
  const r = Math.floor(Math.random()*empty.length);
  return empty[r];
}
