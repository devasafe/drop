import { Request, Response } from 'express';
import { AuthenticatedRequest } from '../types';
import * as notifier from '../services/notifier';

export const subscribeNotifications = (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).end();

  // set SSE headers
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });
  res.flushHeaders?.();

  // send initial ping
  res.write(`event: connected\n`);
  res.write(`data: ${JSON.stringify({ msg: 'connected' })}\n\n`);

  notifier.addClient(userId, res);

  req.on('close', () => {
    notifier.removeClient(userId, res);
  });
};
