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
      try {
        const res = await fetch(
          `https://api.farcaster.xyz/fc/primary-address?fid=${fid}&protocol=ethereum`,
        );
        if (res.ok) {
          const data = await res.json();
          // Проверяем наличие result и address
          if (data && data.result && data.result.address && data.result.address.address) {
            return data.result.address.address;
          }
        }
      } catch (error) {
        // Игнорируем ошибку получения primary address
        console.warn('Не удалось получить primary address:', error);
      }
      return null;
    })();

    // Get user profile from Neynar API (более надежный способ)
    // Если Neynar API ключ не настроен, используем fallback
    let profile = null;
    
    if (NEYNAR_API_KEY && NEYNAR_API_KEY !== 'your_neynar_api_key_here') {
      try {
        const response = await axios.get(`${NEYNAR_BASE_URL}/farcaster/user/bulk`, {
          params: { fids: fid },
          headers: { 'api_key': NEYNAR_API_KEY }
        });
        
        // Neynar возвращает массив users
        if (response.data?.users && response.data.users.length > 0) {
          profile = response.data.users[0];
        }
      } catch (error) {
        // Продолжаем без Neynar - используем fallback
      }
    }
    
    // Neynar API возвращает данные в формате:
    // { username, display_name, pfp_url, ... }
    // Если Neynar недоступен, используем fallback
    const username = profile?.username || null;
    const displayName = profile?.display_name || 
                        profile?.displayName || 
                        username ||
                        null;
    const pfpUrl = profile?.pfp_url || profile?.pfpUrl || profile?.pfp || null;

    return {
      fid,
      primaryAddress,
      username: username || `user_${fid}`,
      displayName: displayName || `User ${fid}`,
      pfp_url: pfpUrl,
      bio: profile?.bio || '',
      verified: profile?.verified || false
    };
  } catch (error) {
    // Return basic user info if API calls fail
    return {
      fid,
      username: `user_${fid}`,
      displayName: `User ${fid}`
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
    res.status(401).json({ error: 'Invalid token' });
    return null;
  }
}

export { resolveUser };
