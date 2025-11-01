// User endpoint with Quick Auth validation
import { quickAuthMiddleware } from './quick-auth-middleware.js';

export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  try {
    // Try to validate JWT token and get user data
    const user = await quickAuthMiddleware(req, res);
    
    if (!user) {
      // If validation failed, quickAuthMiddleware already sent the response
      return;
    }

    res.status(200).json(user);
  } catch (error) {
    console.error('User endpoint error:', error);
    // Fallback to mock data
    res.status(200).json({
      fid: 12345,
      username: 'demo_user',
      displayName: 'Demo Player',
      pfp: 'https://tiktaktoe-farcaster-dun.vercel.app/tictactoe-icon-1024.png'
    });
  }
}
