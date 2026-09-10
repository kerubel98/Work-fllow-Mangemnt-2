import { Router, Request, Response } from 'express';
import { repo } from '../store/repository.js';
import { DirectMessage, AppNotification, NotificationType } from '../types.js';
import { eventService } from '../services/events.js';

export const collaborationRouter = Router();

// ================= DIRECT MESSAGES =================
collaborationRouter.get('/messages/direct', async (req: Request, res: Response) => {
  try {
    const user1Id = req.query.user1Id as string | undefined;
    const user2Id = req.query.user2Id as string | undefined;
    const messages = await repo.getDirectMessages(user1Id, user2Id);
    return res.json(messages);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

collaborationRouter.post('/messages/direct', async (req: Request, res: Response) => {
  try {
    const data: Partial<DirectMessage> = req.body;
    if (!data.senderId || !data.receiverId || !data.content) {
      return res.status(400).json({ error: 'senderId, receiverId, and content are required' });
    }
    const sender = await repo.getUserById(data.senderId);
    const receiver = await repo.getUserById(data.receiverId);

    const newMsg: DirectMessage = {
      id: data.id || `dm-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      senderId: data.senderId,
      senderName: data.senderName || sender?.username || 'User',
      senderRole: data.senderRole || sender?.role || 'operational',
      receiverId: data.receiverId,
      receiverName: data.receiverName || receiver?.username || 'User',
      content: data.content,
      timestamp: new Date().toISOString(),
      isRead: false
    };
    const saved = await repo.createDirectMessage(newMsg);

    // Live broadcast to sender and receiver
    eventService.broadcastEvent('direct_message:new', saved);

    return res.status(201).json(saved);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

collaborationRouter.put('/messages/direct/read', async (req: Request, res: Response) => {
  try {
    const { senderId, receiverId } = req.body;
    if (!senderId || !receiverId) {
      return res.status(400).json({ error: 'senderId and receiverId are required' });
    }
    await repo.markDirectMessagesRead(senderId, receiverId);
    eventService.broadcastEvent('direct_message:read', { senderId, receiverId });
    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ================= NOTIFICATIONS =================
collaborationRouter.get('/notifications', async (req: Request, res: Response) => {
  try {
    const userId = req.query.userId as string | undefined;
    const notifs = await repo.getNotifications(userId);
    return res.json(notifs);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

collaborationRouter.post('/notifications', async (req: Request, res: Response) => {
  try {
    const data: Partial<AppNotification> = req.body;
    if (!data.title || !data.message) {
      return res.status(400).json({ error: 'title and message are required' });
    }
    const notifType: NotificationType = data.type === 'chat' || data.type === 'task_assigned' || data.type === 'team_added' || data.type === 'issue_assigned' || data.type === 'system'
      ? data.type
      : 'system';

    const newNotif: AppNotification = {
      id: data.id || `notif-${Date.now()}`,
      userId: data.userId || 'all',
      type: notifType,
      title: data.title,
      message: data.message,
      timestamp: new Date().toISOString(),
      isRead: false,
      linkTab: data.linkTab,
      targetTeamId: data.targetTeamId,
      targetTaskId: data.targetTaskId,
      targetIssueId: data.targetIssueId,
      targetDirectUserId: data.targetDirectUserId,
      targetSubTab: data.targetSubTab,
      actorName: data.actorName
    };
    const saved = await repo.createNotification(newNotif);

    // Live broadcast to target user or all users
    eventService.broadcastEvent('notification:new', saved, saved.userId);

    return res.status(201).json(saved);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

collaborationRouter.put('/notifications/:id/read', async (req: Request, res: Response) => {
  try {
    const success = await repo.markNotificationRead(req.params.id);
    eventService.broadcastEvent('notification:read', { id: req.params.id });
    return res.json({ success });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});
