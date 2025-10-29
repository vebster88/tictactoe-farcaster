// Simple user endpoint for Mini App
export default function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }
  
  // Mock user data for demo
  const user = {
    fid: 12345,
    username: 'demo_user',
    displayName: 'Demo Player',
    pfp: 'https://tiktaktoe-farcaster-dun.vercel.app/tictactoe-icon-1024.png'
  };
  
  res.status(200).json(user);
}
