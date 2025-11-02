// Quick Auth middleware for validating JWT tokens
import { createClient } from '@farcaster/quick-auth';
import axios from 'axios';

const client = createClient();
const NEYNAR_API_KEY = process.env.NEYNAR_API_KEY;
const NEYNAR_BASE_URL = 'https://api.neynar.com/v2';

// Resolve information about the authenticated Farcaster user
async function resolveUser(fid) {
  try {
    // Get primary address from Farcaster API
    const primaryAddress = await (async () => {
      const res = await fetch(
        `https://api.farcaster.xyz/fc/primary-address?fid=${fid}&protocol=ethereum`,
      );
      if (res.ok) {
        const { result } = await res.json();
        return result.address.address;
      }
    })();

    // Get user profile from Neynar API (более надежный способ)
    // Если Neynar API ключ не настроен, используем fallback
    let profile = null;
    
    if (NEYNAR_API_KEY && NEYNAR_API_KEY !== 'your_neynar_api_key_here') {
      try {
        console.log(`[Quick Auth] Fetching user profile from Neynar API for fid ${fid}`);
        const response = await axios.get(`${NEYNAR_BASE_URL}/farcaster/user/bulk`, {
          params: { fids: fid },
          headers: { 'api_key': NEYNAR_API_KEY }
        });
        
        console.log(`[Quick Auth] Neynar API response for fid ${fid}:`, JSON.stringify(response.data, null, 2));
        
        // Neynar возвращает массив users
        if (response.data?.users && response.data.users.length > 0) {
          profile = response.data.users[0];
          console.log(`[Quick Auth] Profile from Neynar:`, JSON.stringify(profile, null, 2));
        }
      } catch (error) {
        console.error(`[Quick Auth] Neynar API error for fid ${fid}:`, {
          status: error.response?.status,
          statusText: error.response?.statusText,
          message: error.message
        });
        // Продолжаем без Neynar - используем fallback
      }
    } else {
      console.log(`[Quick Auth] Neynar API key not configured, skipping profile fetch`);
    }

    console.log(`[Quick Auth] Profile for fid ${fid}:`, JSON.stringify(profile, null, 2));
    
    // Neynar API возвращает данные в формате:
    // { username, display_name, pfp_url, ... }
    // Если Neynar недоступен, используем fallback
    const username = profile?.username || null;
    const displayName = profile?.display_name || 
                        profile?.displayName || 
                        username ||
                        null;
    const pfp = profile?.pfp_url || 
                profile?.pfpUrl || 
                profile?.pfp ||
                null;

    const result = {
      fid,
      primaryAddress,
      username: username || `user_${fid}`,
      displayName: displayName || `User ${fid}`,
      pfp: pfp || 'https://tiktaktoe-farcaster-dun.vercel.app/tictactoe-icon-1024.png',
      bio: profile?.bio || '',
      verified: profile?.verified || false
    };
    
    console.log(`[Quick Auth] Resolved user data for fid ${fid}:`, JSON.stringify(result, null, 2));
    
    return result;
  } catch (error) {
    console.error('Error resolving user:', error);
    // Return basic user info if API calls fail
    return {
      fid,
      username: `user_${fid}`,
      displayName: `User ${fid}`,
      pfp: 'https://tiktaktoe-farcaster-dun.vercel.app/tictactoe-icon-1024.png'
    };
  }
}

// Quick Auth middleware function
export async function quickAuthMiddleware(req, res) {
  const authorization = req.headers.authorization;
  
  if (!authorization || !authorization.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing token' });
    return null;
  }

  try {
    const token = authorization.split(' ')[1];
    const payload = await client.verifyJwt({
      token: token,
      domain: 'tiktaktoe-farcaster-dun.vercel.app'
    });

    const user = await resolveUser(payload.sub);
    return user;
  } catch (error) {
    console.error('Token validation error:', error);
    res.status(401).json({ error: 'Invalid token' });
    return null;
  }
}

export { resolveUser };
