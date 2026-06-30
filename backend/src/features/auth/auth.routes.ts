import { Router } from 'express';
import * as controller from './auth.controller';
import { authenticate } from '../../middleware/auth.middleware';
import { validate } from '../../middleware/validation.middleware';
import {
  registerValidation,
  loginValidation,
  updateProfileValidation,
  changePasswordValidation,
} from './auth.validation';

const router = Router();

/**
 * @swagger
 * /auth/register:
 *   post:
 *     tags: [Auth]
 *     summary: Register a new user
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password, name]
 *             properties:
 *               email: { type: string, format: email }
 *               password: { type: string, minLength: 8 }
 *               name: { type: string }
 *     responses:
 *       201: { description: User created }
 *       409: { description: Email already registered }
 */
router.post('/register', registerValidation, validate, controller.register);

/**
 * @swagger
 * /auth/login:
 *   post:
 *     tags: [Auth]
 *     summary: Login
 *     security: []
 */
router.post('/login', loginValidation, validate, controller.login);
router.post('/logout', authenticate, controller.logout);
router.post('/refresh', controller.refreshToken);
router.get('/me', authenticate, controller.getMe);
router.patch('/me', authenticate, updateProfileValidation, validate, controller.updateProfile);
router.post('/change-password', authenticate, changePasswordValidation, validate, controller.changePassword);

export default router;
