import { Router } from 'express';
import * as controller from './admin.controller';
import { authenticate } from '../../middleware/auth.middleware';
import { requireAdmin } from '../../middleware/admin.middleware';
import { validate } from '../../middleware/validation.middleware';
import { createUserValidation, updateUserValidation } from './admin.validation';

const router = Router();

router.use(authenticate, requireAdmin);

router.get('/users', controller.listUsers);
router.post('/users', createUserValidation, validate, controller.createUser);
router.patch('/users/:id', updateUserValidation, validate, controller.updateUser);
router.delete('/users/:id', controller.deleteUser);

export default router;
