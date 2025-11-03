// Simple API server for local development
// This server emulates Vercel serverless functions for local dev

import express from 'express';
import cors from 'cors';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json());

// Load environment variables
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

// Helper to create Vercel-like request/response objects
function createHandler(req, res, handler) {
  const vercelReq = {
    method: req.method,
    query: req.query,
    body: req.body,
    headers: req.headers,
  };

  const vercelRes = {
    status: (code) => {
      res.status(code);
      return vercelRes;
    },
    json: (data) => {
      res.json(data);
      return vercelRes;
    },
    setHeader: (name, value) => {
      res.setHeader(name, value);
      return vercelRes;
    },
    end: () => {
      res.end();
      return vercelRes;
    },
  };

  return handler(vercelReq, vercelRes);
}

// API Routes
app.get('/api/matches/list', async (req, res) => {
  try {
    const handler = (await import('../api/matches/list.js')).default;
    await createHandler(req, res, handler);
  } catch (error) {
    console.error('Error in /api/matches/list:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

app.get('/api/matches/get', async (req, res) => {
  try {
    const handler = (await import('../api/matches/get.js')).default;
    await createHandler(req, res, handler);
  } catch (error) {
    console.error('Error in /api/matches/get:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

app.post('/api/matches/create', async (req, res) => {
  try {
    const handler = (await import('../api/matches/create.js')).default;
    await createHandler(req, res, handler);
  } catch (error) {
    console.error('Error in /api/matches/create:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

app.post('/api/matches/accept', async (req, res) => {
  try {
    const handler = (await import('../api/matches/accept.js')).default;
    await createHandler(req, res, handler);
  } catch (error) {
    console.error('Error in /api/matches/accept:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

app.post('/api/matches/move', async (req, res) => {
  try {
    const handler = (await import('../api/matches/move.js')).default;
    await createHandler(req, res, handler);
  } catch (error) {
    console.error('Error in /api/matches/move:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

app.post('/api/matches/check-timeouts', async (req, res) => {
  try {
    const handler = (await import('../api/matches/check-timeouts.js')).default;
    await createHandler(req, res, handler);
  } catch (error) {
    console.error('Error in /api/matches/check-timeouts:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

app.get('/api/user', async (req, res) => {
  try {
    const handler = (await import('../api/user.js')).default;
    await createHandler(req, res, handler);
  } catch (error) {
    console.error('Error in /api/user:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 API server running on http://localhost:${PORT}`);
  console.log(`📡 Proxy requests from Vite dev server to this port`);
});

