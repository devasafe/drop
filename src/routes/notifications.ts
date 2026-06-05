import { Router } from 'express';
import { subscribeNotifications } from '../controllers/notificationsController';
import { listNotifications, markNotificationRead, deleteNotification, markAllRead } from '../controllers/notificationsListController';
import { authenticate, authorizeRoles } from '../middleware/auth';

const router = Router();

router.get('/', authenticate, listNotifications);
router.patch('/read-all', authenticate, markAllRead);
router.patch('/:id/read', authenticate, markNotificationRead);
router.delete('/:id', authenticate, deleteNotification);

// SSE endpoint for motoboys to receive notifications
router.get('/stream', authenticate, authorizeRoles('motoboy'), subscribeNotifications);

export default router;
