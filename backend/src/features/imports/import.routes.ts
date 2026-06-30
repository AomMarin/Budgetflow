import { Router } from 'express';
import * as controller from './import.controller';
import { authenticate } from '../../middleware/auth.middleware';
import { uploadMiddleware } from '../../middleware/upload.middleware';
import { body } from 'express-validator';
import { validate } from '../../middleware/validation.middleware';

const router = Router();

router.use(authenticate);

router.get('/', controller.getAll);
router.post('/upload', uploadMiddleware, controller.upload);
router.get('/rules', controller.getRules);
router.post(
  '/rules',
  [
    body('keyword').trim().notEmpty().withMessage('Keyword is required'),
    body('budgetId').isString().notEmpty().withMessage('Budget ID is required'),
    body('priority').optional().isInt({ min: 0 }),
  ],
  validate,
  controller.createRule,
);
router.delete('/rules/:id', controller.deleteRule);
router.get('/:id', controller.getStatus);
router.get('/:id/transactions', controller.getImportedTransactions);

export default router;
