import { body } from 'express-validator';

export const createUserValidation = [
  body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
  body('password')
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters')
    .matches(/^(?=.*[A-Z])(?=.*[0-9])/)
    .withMessage('Password must contain an uppercase letter and a number'),
  body('name').trim().isLength({ min: 2, max: 100 }).withMessage('Name must be 2-100 characters'),
  body('role').optional().isIn(['USER', 'ADMIN']).withMessage('Role must be USER or ADMIN'),
];

export const updateUserValidation = [
  body('email').optional().isEmail().normalizeEmail().withMessage('Valid email is required'),
  body('password')
    .optional()
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters')
    .matches(/^(?=.*[A-Z])(?=.*[0-9])/)
    .withMessage('Password must contain an uppercase letter and a number'),
  body('name').optional().trim().isLength({ min: 2, max: 100 }).withMessage('Name must be 2-100 characters'),
  body('role').optional().isIn(['USER', 'ADMIN']).withMessage('Role must be USER or ADMIN'),
];
