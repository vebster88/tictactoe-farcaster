// API endpoint for user information in Farcaster Mini App
export default function handler(req, res) {
  // Set CORS headers for Farcaster Mini App
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }
  
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  
  // Return mock user data for testing
  // In production, this would fetch real user data from Farcaster
  const user = {
    fid: 12345,
    username: 'testuser',
    displayName: 'Test User',
    pfpUrl: 'https://via.placeholder.com/150',
    verifiedAddresses: {
      ethereum: ['0x1234567890123456789012345678901234567890']
    },
    followerCount: 100,
    followingCount: 50,
    bio: 'TicTacToe player'
  };
  
  res.status(200).json(user);
}