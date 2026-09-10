class EventService {
    clients = new Map();
    heartbeatTimer = null;
    constructor() {
        // Send keepalive comments every 20 seconds so browsers don't drop connections
        this.heartbeatTimer = setInterval(() => {
            this.sendHeartbeat();
        }, 20000);
    }
    registerClient(res, userId) {
        const clientId = `client-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        // Set headers for Server-Sent Events
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx proxy buffering if present
        res.flushHeaders?.();
        const client = { id: clientId, userId, res };
        this.clients.set(clientId, client);
        // Initial handshake event
        this.sendToClient(client, 'connected', { clientId, connectedAt: new Date().toISOString() });
        res.on('close', () => {
            this.clients.delete(clientId);
        });
        return clientId;
    }
    unregisterClient(clientId) {
        this.clients.delete(clientId);
    }
    sendToClient(client, eventType, data) {
        try {
            client.res.write(`event: ${eventType}\n`);
            client.res.write(`data: ${JSON.stringify(data)}\n\n`);
        }
        catch {
            this.clients.delete(client.id);
        }
    }
    sendHeartbeat() {
        for (const [id, client] of this.clients.entries()) {
            try {
                client.res.write(`: heartbeat\n\n`);
            }
            catch {
                this.clients.delete(id);
            }
        }
    }
    /**
     * Broadcasts an event to all connected clients or specifically to a target user.
     */
    broadcastEvent(eventType, data, targetUserId) {
        for (const [id, client] of this.clients.entries()) {
            if (!targetUserId || targetUserId === 'all' || client.userId === targetUserId) {
                this.sendToClient(client, eventType, data);
            }
        }
    }
    getActiveClientCount() {
        return this.clients.size;
    }
}
export const eventService = new EventService();
