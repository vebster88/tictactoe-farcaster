// Quick Auth middleware for validating JWT tokens
import { createClient } from '@farcaster/quick-auth';

const client = createClient();

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

    // Get user profile from Farcaster API
    const profile = await (async () => {
      const res = await fetch(
        `https://api.farcaster.xyz/fc/user?fid=${fid}`,
      );
      if (res.ok) {
        const { result } = await res.json();
        return result.user;
      }
    })();

    return {
      fid,
      primaryAddress,
      username: profile?.username || `user_${fid}`,
      displayName: profile?.displayName || profile?.username || `User ${fid}`,
      pfp: profile?.pfp || 'https://tiktaktoe-farcaster-dun.vercel.app/tictactoe-icon-1024.png',
      bio: profile?.bio || '',
      verified: profile?.verified || false
    };
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
