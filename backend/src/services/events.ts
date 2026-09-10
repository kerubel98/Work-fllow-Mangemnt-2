import { Response } from 'express';

export interface SseClient {
  id: string;
  userId?: string;
  res: Response;
}

class EventService {
  private clients: Map<string, SseClient> = new Map();
  private heartbeatTimer: NodeJS.Timeout | null = null;

  constructor() {
    // Send keepalive comments every 20 seconds so browsers don't drop connections
    this.heartbeatTimer = setInterval(() => {
      this.sendHeartbeat();
    }, 20000);
  }

  public registerClient(res: Response, userId?: string): string {
    const clientId = `client-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    
    // Set headers for Server-Sent Events
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx proxy buffering if present
    res.flushHeaders?.();

    const client: SseClient = { id: clientId, userId, res };
    this.clients.set(clientId, client);

    // Initial handshake event
    this.sendToClient(client, 'connected', { clientId, connectedAt: new Date().toISOString() });

    res.on('close', () => {
      this.clients.delete(clientId);
    });

    return clientId;
  }

  public unregisterClient(clientId: string) {
    this.clients.delete(clientId);
  }

  private sendToClient(client: SseClient, eventType: string, data: any) {
    try {
      client.res.write(`event: ${eventType}\n`);
      client.res.write(`data: ${JSON.stringify(data)}\n\n`);
    } catch {
      this.clients.delete(client.id);
    }
  }

  private sendHeartbeat() {
    for (const [id, client] of this.clients.entries()) {
      try {
        client.res.write(`: heartbeat\n\n`);
      } catch {
        this.clients.delete(id);
      }
    }
  }

  /**
   * Broadcasts an event to all connected clients or specifically to a target user.
   */
  public broadcastEvent(eventType: string, data: any, targetUserId?: string) {
    for (const [id, client] of this.clients.entries()) {
      if (!targetUserId || targetUserId === 'all' || client.userId === targetUserId) {
        this.sendToClient(client, eventType, data);
      }
    }
  }

  public getActiveClientCount(): number {
    return this.clients.size;
  }
}

export const eventService = new EventService();
