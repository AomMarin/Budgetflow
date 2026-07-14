import { Router } from 'express';
import * as controller from './notification.controller';
import { authenticate } from '../../middleware/auth.middleware';

const router = Router();

router.use(authenticate);

router.get('/', controller.getAll);
router.get('/unread-count', controller.getUnreadCount);
router.patch('/:id/read', controller.markRead);
router.patch('/read-all', controller.markAllRead);

export default router;
