# Vercel KV Setup Guide

This guide explains how to set up Vercel KV for the TicTacToe Farcaster PvP match system.

## Overview

The PvP game system uses Vercel KV (Key-Value storage) to store match data, including:
- Match states (board, turn, winner)
- Player information
- Timer information
- Match status (pending, active, finished, timeout)

## Setup Steps

### 1. Install Vercel KV

The `@vercel/kv` package is already included in `package.json`. If you need to install it:

```bash
npm install @vercel/kv
```

### 2. Create a Vercel KV Database

1. Go to [Vercel Dashboard](https://vercel.com/dashboard)
2. Select your project
3. Go to **Storage** tab
4. Click **Create Database**
5. Select **KV** (Redis)
6. Choose a name for your database
7. Click **Create**

### 3. Configure Environment Variables

After creating the KV database, Vercel automatically provides environment variables:

- `KV_REST_API_URL` - The REST API URL for your KV database
- `KV_REST_API_TOKEN` - The authentication token
- `KV_REST_API_READ_ONLY_TOKEN` - (Optional) Read-only token

These are automatically added to your Vercel project environment variables.

### 4. Local Development

For local development, you have two options:

#### Option A: Use Fallback Memory Store (Default)

The system automatically falls back to an in-memory store when KV is not configured. This is useful for:
- Local development without KV
- Testing without a Vercel account
- Quick prototyping

**Note:** Data is lost when the server restarts.

#### Option B: Use Local Redis

1. Install Redis locally:
   ```bash
   # macOS
   brew install redis
   
   # Ubuntu/Debian
   sudo apt-get install redis-server
   
   # Windows (using WSL)
   # Install via WSL or use Docker
   ```

2. Start Redis:
   ```bash
   redis-server
   ```

3. Create `.env.local`:
   ```env
   KV_REST_API_URL=http://localhost:6379
   KV_REST_API_TOKEN=your_local_token
   ```

### 5. Verify Setup

To verify that KV is working:

1. Deploy to Vercel
2. Create a match through the UI
3. Check Vercel logs for any KV errors
4. Try retrieving the match through the API

## API Endpoints

The following endpoints use KV:

- `POST /api/matches/create` - Create a new match
- `GET /api/matches/get?matchId=...` - Get match by ID
- `POST /api/matches/accept` - Accept a pending match
- `POST /api/matches/move` - Make a move in a match
- `GET /api/matches/list?fid=...` - List all matches for a player
- `GET /api/matches/check-timeouts` - Check for timed-out matches

## Data Structure

Matches are stored with the following structure:

```javascript
{
  matchId: "string",
  player1Fid: number,
  player2Fid: number | null,
  player1Symbol: "X" | "O",
  player2Symbol: "X" | "O",
  status: "pending" | "active" | "finished" | "timeout" | "cancelled",
  gameState: {
    board: Array(9).fill(null),
    next: "X" | "O",
    turn: number,
    winner: "X" | "O" | null,
    winLine: number[] | null,
    finished: boolean
  },
  rules: object,
  createdAt: ISOString,
  updatedAt: ISOString,
  lastMoveAt: ISOString,
  turnTimeout: number // 24 hours in milliseconds
}
```

## Fallback Behavior

If KV is not available, the system:
1. Automatically detects missing KV configuration
2. Falls back to in-memory storage
3. Continues working for development/testing
4. Shows warnings in server logs

**Important:** In-memory storage is not persistent across server restarts and is not suitable for production.

## Troubleshooting

### Error: "KV is not configured"

- **Solution:** Check that environment variables are set in Vercel Dashboard
- **Alternative:** Use fallback mode for local development

### Error: "Failed to get match"

- **Solution:** Verify KV database is created and connected
- **Check:** Vercel project settings → Storage

### Matches not persisting

- **Cause:** Using fallback memory store
- **Solution:** Configure Vercel KV in production

### Timeout errors

- **Cause:** Redis connection issues
- **Solution:** Check KV database status in Vercel Dashboard

## Production Considerations

1. **Persistence:** Ensure KV is configured in production
2. **Scaling:** KV handles high concurrency automatically
3. **Backup:** Vercel KV is managed and backed up automatically
4. **Cost:** Check Vercel pricing for KV usage

## Additional Resources

- [Vercel KV Documentation](https://vercel.com/docs/storage/vercel-kv)
- [Redis Commands Reference](https://redis.io/commands/)
- [Vercel Environment Variables](https://vercel.com/docs/concepts/projects/environment-variables)

