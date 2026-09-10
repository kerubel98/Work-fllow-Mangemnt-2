import { Router, Request, Response } from 'express';
import { eventService } from '../services/events.js';

export const eventsRouter = Router();

/**
 * GET /api/events
 * Real-time Server-Sent Events (SSE) stream.
 * Automatically broadcasts live direct messages, notifications, team chat, and issue updates.
 */
eventsRouter.get('/events', (req: Request, res: Response) => {
  const userId = (req.query.userId as string) || undefined;
  eventService.registerClient(res, userId);
});

eventsRouter.get('/events/stats', (_req: Request, res: Response) => {
  res.json({
    activeConnections: eventService.getActiveClientCount(),
    timestamp: new Date().toISOString()
  });
});
