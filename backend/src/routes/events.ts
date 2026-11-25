import { Router, Request, Response } from 'express';
import { eventService } from '../services/events.js';
import { verifyToken, JwtUserPayload } from '../utils/auth.js';

export const eventsRouter = Router();

/**
 * GET /api/events
 * Real-time Server-Sent Events (SSE) stream.
 * Automatically broadcasts live direct messages, notifications, team chat, and issue updates.
 * Governed by AUD-GOV-001: Enforces verified JWT token authentication.
 */
eventsRouter.get('/events', (req: Request, res: Response) => {
  const authHeader = req.headers['authorization'] || req.headers['x-auth-token'];
  const tokenFromHeader = typeof authHeader === 'string' && authHeader.startsWith('Bearer ')
    ? authHeader.slice(7).trim()
    : (typeof authHeader === 'string' ? authHeader.trim() : null);
  const tokenFromQuery = typeof req.query.token === 'string' ? req.query.token.trim() : null;
  const token = tokenFromHeader || tokenFromQuery;

  if (!token) {
    res.status(401).json({ error: 'Authentication required. Missing token for events stream.' });
    return;
  }

  const payload = verifyToken<JwtUserPayload>(token);
  if (!payload) {
    res.status(401).json({ error: 'Invalid or expired authentication token.' });
    return;
  }

  // Use verified user identity from token payload (never trust spoofable query params)
  const verifiedUserId = payload.id;
  eventService.registerClient(res, verifiedUserId);
});

eventsRouter.get('/events/stats', (req: Request, res: Response) => {
  const authHeader = req.headers['authorization'] || req.headers['x-auth-token'];
  const token = typeof authHeader === 'string' && authHeader.startsWith('Bearer ')
    ? authHeader.slice(7).trim()
    : (typeof authHeader === 'string' ? authHeader.trim() : null);

  if (!token || !verifyToken(token)) {
    res.status(401).json({ error: 'Authentication required.' });
    return;
  }

  res.json({
    activeConnections: eventService.getActiveClientCount(),
    timestamp: new Date().toISOString()
  });
});
